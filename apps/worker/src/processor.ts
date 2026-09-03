import { Job, Worker } from "bullmq"
import { EmployeeRepository, ResolutionService } from "@policy/core"
import { OUTBOX_EVENT_TYPES } from "@policy/shared"
import { env } from "./config/env"
import { RECONCILIATION_QUEUE, ReconcileEmployeeJob, connection } from "./queue"
import { ReconciliationPublisher } from "./stream"

/**
 * The event types this processor knows how to act on.
 *
 * Every one of them resolves to a single employee, which is the only shape of
 * reconciliation the worker currently performs. The relay will not build a job
 * for anything else — this set is the second half of the same boundary, checked
 * again here so that a job arriving by any other route (a hand-enqueued one, a
 * relay from a future version) cannot be acted on by accident.
 */
const HANDLED_EVENT_TYPES = new Set<string>([
  OUTBOX_EVENT_TYPES.EMPLOYEE_CREATED,
  OUTBOX_EVENT_TYPES.EMPLOYEE_ATTRIBUTES_CHANGED,
  OUTBOX_EVENT_TYPES.GROUP_MEMBERSHIP_CHANGED,
  // Rule events reach here only for a MANUAL override, which names the one
  // employee it targets. The relay rejects the others.
  OUTBOX_EVENT_TYPES.RULE_CREATED,
  OUTBOX_EVENT_TYPES.RULE_UPDATED,
  OUTBOX_EVENT_TYPES.RULE_ENABLED,
  OUTBOX_EVENT_TYPES.RULE_DISABLED,
  OUTBOX_EVENT_TYPES.RULE_PRIORITY_CHANGED,
  OUTBOX_EVENT_TYPES.RULE_DELETED,
  OUTBOX_EVENT_TYPES.OVERRIDE_CREATED,
  OUTBOX_EVENT_TYPES.OVERRIDE_DELETED,
])

/**
 * A job the worker will not guess at.
 *
 * Thrown rather than returned, so BullMQ retries it and then keeps it in the
 * failed set. A job quietly marked complete because nothing knew what to do with
 * it is reconciliation that never happened and that nobody was told about.
 */
export class UnsupportedOutboxEventError extends Error {

  constructor(eventType: string) {

    super(`No handler for outbox event type "${eventType}"`)

    this.name = "UnsupportedOutboxEventError"
  }
}

/**
 * The consumer.
 *
 * It does no policy reasoning of its own. Reconciliation — desired versus
 * current, close the difference, open the difference, write the decision log and
 * the audit row, all in one transaction — is `ResolutionService.reconcile`,
 * which the API's synchronous endpoint already calls. There is one
 * implementation of that diff and this is a second caller of it, not a second
 * copy.
 *
 * Because that diff is idempotent, this processor is safe to retry: a redelivery
 * recomputes the same desired set, finds it already materialized, and writes
 * nothing.
 */
export class ReconciliationProcessor {

  private worker: Worker<ReconcileEmployeeJob> | null = null

  constructor(
    private resolution: ResolutionService,
    private employees: EmployeeRepository,
    private publisher: ReconciliationPublisher,
  ) {}

  /** Start consuming. Returns once the worker is listening. */
  start(): Worker<ReconcileEmployeeJob> {

    if (this.worker) {

      return this.worker
    }

    this.worker = new Worker<ReconcileEmployeeJob>(
      RECONCILIATION_QUEUE,
      async (job) => this.handle(job),
      {
        connection,
        concurrency: env.RECONCILIATION_CONCURRENCY,
      },
    )

    this.worker.on("failed", (job, error) => {

      console.error(`[worker] job ${job?.id ?? "?"} failed`, error)
    })

    this.worker.on("error", (error) => {

      console.error("[worker] queue error", error)
    })

    console.log(
      `[worker] consuming "${RECONCILIATION_QUEUE}" ` +
        `with concurrency ${env.RECONCILIATION_CONCURRENCY}`,
    )

    return this.worker
  }

  /**
   * Stop consuming and let what is running finish.
   *
   * `close()` without `force` stops BullMQ taking new jobs and waits for the
   * in-flight ones. Killing a job mid-transaction would not corrupt anything —
   * the transaction rolls back — but it would leave the outbox row PROCESSED
   * with its work undone, which is the one way this pipeline can lose an update.
   */
  async stop(): Promise<void> {

    if (!this.worker) {

      return
    }

    await this.worker.close()

    this.worker = null

    await this.publisher.close()
  }

  private async handle(job: Job<ReconcileEmployeeJob>): Promise<void> {

    const { organizationId, employeeId, eventType, asOf } = job.data

    if (!HANDLED_EVENT_TYPES.has(eventType)) {

      throw new UnsupportedOutboxEventError(eventType)
    }

    const employee = await this.employees.findById(organizationId, employeeId)

    // DECISION: a job whose employee has since been terminated (or removed) is
    // completed, not failed. `ResolutionService.reconcile` refuses a TERMINATED
    // employee outright — termination end-dated their assignments deliberately,
    // and re-resolving would resurrect them — so a change queued just before a
    // termination would otherwise retry into that same refusal until it landed
    // in the failed set. The employee state the job would restore no longer
    // exists to be restored. Logged, so the skip is visible.
    if (!employee || employee.status === "TERMINATED") {

      console.log(
        `[worker] ${eventType} employee=${employeeId} skipped: ` +
          (employee ? "employee is terminated" : "employee no longer exists"),
      )

      return
    }

    // DECISION: `asOf` is left to the service, which defaults it to today,
    // rather than being taken from the producing event's `effectiveFrom`.
    // Reconciling as of a past day would materialize assignments as they should
    // have been then and leave everything since untouched, which is a
    // backfill — a different operation from keeping today's state correct, and
    // one nothing has asked for. The effective date the change carried is
    // already recorded in the attribute history that explains it.
    const result = await this.resolution.reconcile(
      organizationId,
      // Null actor: this run has no user behind it. `audit_events.actor_id` is
      // nullable precisely for the reconciliation worker.
      null,
      employeeId,
      {},
    )

    console.log(
      `[worker] ${eventType} employee=${employeeId} asOf=${result.asOf} ` +
        `(+${result.added.length} -${result.removed.length} ` +
        `=${result.unchanged.length})` +
        (asOf ? ` [event effective ${asOf}]` : ""),
    )

    await this.publisher.publish(result, {
      organizationId,
      employeeName: employee.name,
      trigger: eventType,
      outboxEventId: job.data.outboxEventId ?? null,
    })
  }
}
