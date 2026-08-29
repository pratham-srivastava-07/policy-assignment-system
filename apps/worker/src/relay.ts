import { Queue } from "bullmq"
import { OutboxEvent, OutboxEventRepository } from "@policy/core"
import { OUTBOX_EVENT_TYPES } from "@policy/shared"
import { env } from "./config/env"
import { RECONCILE_EMPLOYEE_JOB, ReconcileEmployeeJob } from "./queue"

/**
 * What the relay decided to do with one row.
 *
 *   `enqueue`  — a job was built for it;
 *   `settle`   — nothing to enqueue, and nothing will ever need to be;
 *   `reject`   — this row names work the relay cannot express as a job.
 */
type Plan =
  | { action: "enqueue"; job: ReconcileEmployeeJob }
  | { action: "settle"; reason: string }
  | { action: "reject"; reason: string }

/** The payload shape the producers write. Every field is checked before use. */
interface OutboxPayload {
  employeeId?: unknown
  changedAttributes?: unknown
  effectiveFrom?: unknown
}

/**
 * The outbox relay.
 *
 * Turns committed outbox rows into queue jobs, and is the only thing standing
 * between "the change is durable" and "the work is scheduled". Everything about
 * it is arranged so that the second of those can lag the first, but never
 * contradict it:
 *
 *   * it CLAIMS before it enqueues, so a crash mid-batch strands rows in a state
 *     the next poll takes back rather than losing them;
 *   * it enqueues under a jobId derived from the row, so a row delivered twice
 *     is one job;
 *   * it backs a failing row off exponentially and eventually stops, so one
 *     undeliverable row cannot occupy the loop forever.
 *
 * It holds no SQL. The claim needs row-level locking that skips rows another
 * relay already holds, which Prisma's query API cannot state, so that statement
 * lives in `OutboxEventRepository.claimPending` alongside every other statement
 * against this table. The relay calls the repository and knows nothing else.
 */
export class OutboxRelay {

  private running = false

  private draining = false

  private timer: NodeJS.Timeout | null = null

  private wake: (() => void) | null = null

  private idle: (() => void) | null = null

  constructor(
    private outbox: OutboxEventRepository,
    private queue: Queue<ReconcileEmployeeJob>,
  ) {}

  /** Begin polling. Returns immediately; the loop runs on its own. */
  start(): void {

    if (this.running) {

      return
    }

    this.running = true

    console.log(
      `[relay] polling every ${env.OUTBOX_POLL_INTERVAL_MS}ms, ` +
        `${env.OUTBOX_BATCH_SIZE} rows per batch`,
    )

    void this.loop()
  }

  /**
   * Stop polling and wait for the batch in flight.
   *
   * Returning before the current batch finished would mean closing the queue
   * underneath rows that are already claimed, which strands them for a whole
   * lease. Waiting is cheap: a batch is one claim and a handful of enqueues.
   */
  async stop(): Promise<void> {

    this.running = false

    // Cut the poll interval short rather than waiting it out, and resolve the
    // sleep it was awaiting so the loop reaches its exit condition instead of
    // being left holding a promise that will never settle.
    if (this.timer) {

      clearTimeout(this.timer)

      this.timer = null
    }

    if (this.wake) {

      this.wake()

      this.wake = null
    }

    if (!this.draining) {

      return
    }

    console.log("[relay] waiting for the batch in flight")

    await new Promise<void>((resolve) => {

      this.idle = resolve
    })
  }

  // -------------------------------------------------------------------------
  // The loop
  // -------------------------------------------------------------------------

  private async loop(): Promise<void> {

    while (this.running) {

      this.draining = true

      let claimed = 0

      try {

        claimed = await this.drain()
      } catch (error) {

        // A failure here is the poll itself failing — the database is
        // unreachable, or the claim statement threw. No row was claimed, so
        // nothing is stranded; sleep and come back.
        console.error("[relay] poll failed", error)
      }

      this.draining = false

      if (this.idle) {

        this.idle()

        this.idle = null

        return
      }

      // A full batch means there is very likely more waiting, so go straight
      // round again rather than sleeping through a backlog.
      if (claimed >= env.OUTBOX_BATCH_SIZE) {

        continue
      }

      await this.sleep(env.OUTBOX_POLL_INTERVAL_MS)
    }
  }

  /** One pass: reclaim what expired, claim what is due, dispatch it. */
  private async drain(): Promise<number> {

    const now = new Date()

    const released = await this.outbox.releaseExpired(now)

    if (released > 0) {

      console.warn(`[relay] released ${released} row(s) whose claim expired`)
    }

    const leaseUntil = new Date(now.getTime() + env.OUTBOX_CLAIM_LEASE_MS)

    const rows = await this.outbox.claimPending(env.OUTBOX_BATCH_SIZE, now, leaseUntil)

    for (const row of rows) {

      await this.dispatch(row)
    }

    return rows.length
  }

  /**
   * One claimed row: decide what it means, then act on that decision.
   *
   * The row is already claimed by the time this runs, which is the ordering that
   * matters. If the process dies here, the row is PROCESSING with a lease that
   * will expire and hand it back — a duplicate delivery, never a dropped one.
   * Duplicates are the cheap failure: the reconciliation diff is idempotent, so
   * running it twice for the same employee writes nothing the second time.
   */
  private async dispatch(row: OutboxEvent): Promise<void> {

    const plan = this.plan(row)

    if (plan.action === "settle") {

      await this.outbox.markProcessed(row.id)

      console.log(`[relay] ${row.eventType} ${row.id}: ${plan.reason}`)

      return
    }

    if (plan.action === "reject") {

      // Not a transient failure: nothing about waiting makes this row
      // deliverable, so it goes straight to terminal FAILED rather than
      // consuming five attempts to arrive at the same place. It stays on the
      // table, loudly, as the record of work that was owed and not done.
      await this.outbox.markPermanentlyFailed(row.id)

      console.error(
        `[relay] ${row.eventType} ${row.id} cannot be dispatched: ${plan.reason}. ` +
          "Row left FAILED.",
      )

      return
    }

    try {

      await this.enqueue(plan.job)

      await this.outbox.markProcessed(row.id)
    } catch (error) {

      await this.retry(row, error)
    }
  }

  /**
   * Hand the job to BullMQ.
   *
   * `jobId` is the outbox row's id, so a row that gets delivered twice — a lease
   * that expired while the enqueue was actually succeeding, say — collapses onto
   * the job that already exists instead of creating a second one. BullMQ
   * de-duplicates on this id for as long as the job is retained.
   *
   * That de-duplication is an optimisation, not the correctness argument. The
   * real safety net is that reconciliation is a diff: it recomputes the desired
   * assignments and writes only the difference from what is already there, so a
   * second run for the same employee finds no difference and writes nothing.
   * Duplicate jobs are therefore wasteful, never wrong — which is what makes it
   * safe for this relay to prefer delivering twice over delivering never.
   */
  private async enqueue(job: ReconcileEmployeeJob): Promise<void> {

    await this.queue.add(RECONCILE_EMPLOYEE_JOB, job, {
      jobId: job.outboxEventId,
    })
  }

  /**
   * The enqueue failed. Redis was down, most likely.
   *
   * Back off exponentially from `OUTBOX_BACKOFF_BASE_MS`, doubling per attempt
   * and capped, so a Redis outage is retried patiently rather than hammered.
   * Past `OUTBOX_MAX_ATTEMPTS` the row is left FAILED and stops being selected:
   * a row that has failed to enqueue five times with growing gaps is not going
   * to succeed on the sixth, and a relay that keeps claiming it is a relay
   * spending its batch on one row instead of the ones behind it.
   */
  private async retry(row: OutboxEvent, error: unknown): Promise<void> {

    const attempts = row.attempts + 1

    if (attempts >= env.OUTBOX_MAX_ATTEMPTS) {

      await this.outbox.markPermanentlyFailed(row.id)

      console.error(
        `[relay] ${row.eventType} ${row.id} failed to enqueue ${attempts} time(s). ` +
          "Giving up; row left FAILED.",
        error,
      )

      return
    }

    const nextAttemptAt = new Date(Date.now() + this.backoffMs(attempts))

    await this.outbox.markFailed(row.id, nextAttemptAt)

    console.warn(
      `[relay] ${row.eventType} ${row.id} failed to enqueue ` +
        `(attempt ${attempts}/${env.OUTBOX_MAX_ATTEMPTS}), ` +
        `retrying at ${nextAttemptAt.toISOString()}`,
      error,
    )
  }

  /** base * 2^(attempt - 1), capped. Attempt 1 waits `base`. */
  private backoffMs(attempt: number): number {

    const grown = env.OUTBOX_BACKOFF_BASE_MS * Math.pow(2, attempt - 1)

    return Math.min(grown, env.OUTBOX_BACKOFF_MAX_MS)
  }

  // -------------------------------------------------------------------------
  // Row -> plan
  // -------------------------------------------------------------------------

  /**
   * What this row means, decided from what the producer actually wrote.
   *
   * The rule is the payload, not the event type: any row that names an employee
   * becomes a reconciliation for that employee, whatever produced it. That
   * covers `employee.created`, `employee.attributes_changed`,
   * `group.membership_changed`, and every rule event for a MANUAL override —
   * an override names the one employee it targets, so its affected population is
   * known exactly.
   *
   * DECISION: a rule event for a non-manual rule, and `group.deleted`, are
   * REJECTED rather than dispatched. Their affected population is a set of
   * employees that the payload does not name and that no repository query
   * currently answers — `docs/architecture.md` §12 requires the worker to narrow
   * the population rather than sweep the organization, and building that
   * narrowing is a design task, not a wiring one. Rejecting is the honest state:
   * the row stays FAILED on the table, visible, as reconciliation that is owed
   * and not done. Sweeping every employee instead would be inventing the
   * behaviour the document warns against, and silently marking it PROCESSED
   * would hide it.
   */
  private plan(row: OutboxEvent): Plan {

    // Checked before the employeeId branch, because a termination row names an
    // employee but must not be reconciled.
    //
    // DECISION: a no-op, not a job. Terminating already end-dated every
    // assignment in the same transaction that wrote this row, and
    // `ResolutionService.reconcile` refuses a TERMINATED employee outright — so
    // enqueuing this would produce a job that can only ever fail. The row is
    // settled, with a line in the log saying so.
    if (row.eventType === OUTBOX_EVENT_TYPES.EMPLOYEE_TERMINATED) {

      return {
        action: "settle",
        reason: "termination end-dated the assignments in its own transaction; nothing to resolve",
      }
    }

    const payload = this.payload(row)
    const employeeId = this.text(payload.employeeId)

    if (!employeeId) {

      return {
        action: "reject",
        reason: "no employeeId in the payload, and this worker cannot derive the affected population",
      }
    }

    const asOf = this.text(payload.effectiveFrom)
    const changedAttributes = this.attributes(payload.changedAttributes)

    return {
      action: "enqueue",
      job: {
        outboxEventId: row.id,
        organizationId: row.organizationId,
        employeeId,
        eventType: row.eventType,
        ...(asOf !== null && { asOf }),
        ...(changedAttributes !== null && { changedAttributes }),
      },
    }
  }

  /** The payload column is `Json`, so it is whatever was written. Treat it so. */
  private payload(row: OutboxEvent): OutboxPayload {

    if (row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)) {

      return row.payload as OutboxPayload
    }

    return {}
  }

  private text(value: unknown): string | null {

    if (typeof value === "string" && value.length > 0) {

      return value
    }

    return null
  }

  private attributes(value: unknown): string[] | null {

    if (!Array.isArray(value)) {

      return null
    }

    const names = value.filter((entry): entry is string => typeof entry === "string")

    return names.length > 0 ? names : null
  }

  private sleep(ms: number): Promise<void> {

    return new Promise<void>((resolve) => {

      this.wake = resolve

      this.timer = setTimeout(() => {

        this.wake = null

        resolve()
      }, ms)
    })
  }
}
