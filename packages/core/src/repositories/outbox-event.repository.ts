import { OutboxEvent, Prisma, PrismaClass } from "@policy/db"
import {
  OUTBOX_STATUSES,
  OutboxAggregateType,
  OutboxEventType,
  OutboxStatus,
} from "@policy/shared"
import { TxClient } from "../interfaces/db"

export interface OutboxListFilters {
  status?: OutboxStatus
  aggregateType?: string
  aggregateId?: string
}

export interface CreateOutboxEventRecord {
  eventType: OutboxEventType | string
  aggregateType: OutboxAggregateType | string
  aggregateId: string
  payload: unknown
  /** Delay the relay until this instant. Defaults to now. */
  availableAt?: Date
}

/**
 * The transactional outbox.
 *
 * A reconciliation job is enqueued by writing a row here inside the SAME
 * transaction as the state change that requires it. That removes the dual-write
 * problem: there is no window in which the employee was updated but the job was
 * lost, or in which a job exists for a change that rolled back.
 *
 * `apps/worker` drains it. Every statement the relay needs is in this file,
 * including the two that have to be raw SQL: Prisma has no `FOR UPDATE SKIP
 * LOCKED`, and the worker is not allowed to hold SQL. It calls these.
 */
class OutboxEventRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  /**
   * Enqueue. The `tx` argument is not optional in spirit: calling this outside
   * the transaction that made the state change defeats the entire pattern.
   */
  async enqueue(
    organizationId: string,
    data: CreateOutboxEventRecord,
    tx?: TxClient,
  ): Promise<OutboxEvent> {

    return this.db(tx).outboxEvent.create({
      data: {
        organizationId,
        eventType: data.eventType,
        aggregateType: data.aggregateType,
        aggregateId: data.aggregateId,
        payload: data.payload as Prisma.InputJsonValue,
        ...(data.availableAt !== undefined && { availableAt: data.availableAt }),
      },
    })
  }

  /**
   * Take ownership of up to `limit` rows that are due, and return them.
   *
   * This is the one query that has to be raw. `FOR UPDATE SKIP LOCKED` is what
   * lets several relay instances drain the same table at once: the inner SELECT
   * takes a row lock on each candidate and silently steps over any row another
   * instance already holds, so two relays reading concurrently get two disjoint
   * batches and the same outbox row is never enqueued twice.
   *
   * Claiming and selecting are ONE statement on purpose. Reading first and
   * updating second would leave a window between the two in which a second relay
   * could read the same rows; the lock the SELECT takes is held until this
   * statement's transaction commits, and the UPDATE it feeds flips the rows to
   * PROCESSING before that happens.
   *
   * `leaseUntil` is a visibility timeout, not a schedule. A relay that dies
   * after claiming would otherwise strand its batch in PROCESSING forever, so
   * `available_at` is pushed out to the lease and `releaseExpired` hands the
   * rows back when it passes. Claimed-but-not-enqueued therefore means "retried
   * late", never "lost".
   */
  async claimPending(
    limit: number,
    now: Date,
    leaseUntil: Date,
    tx?: TxClient,
  ): Promise<OutboxEvent[]> {

    return this.db(tx).$queryRaw<OutboxEvent[]>`
      UPDATE outbox_events
      SET status = 'PROCESSING', available_at = ${leaseUntil}
      WHERE id IN (
        SELECT id
        FROM outbox_events
        WHERE status = 'PENDING'
          AND available_at <= ${now}
        ORDER BY available_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING
        id,
        organization_id AS "organizationId",
        event_type AS "eventType",
        aggregate_type AS "aggregateType",
        aggregate_id AS "aggregateId",
        payload,
        status,
        attempts,
        available_at AS "availableAt",
        processed_at AS "processedAt",
        created_at AS "createdAt"
    `
  }

  /**
   * Hand back rows whose claim expired.
   *
   * A row sits in PROCESSING only while some relay is mid-flight with it. If its
   * lease has passed, the relay that took it is gone, and the row is due again.
   * `attempts` is deliberately NOT incremented here: a crashed relay is not a
   * failed delivery, and counting it as one would burn the poison-row budget of
   * a job that was never actually tried.
   */
  async releaseExpired(now: Date, tx?: TxClient): Promise<number> {

    const released = await this.db(tx).$executeRaw`
      UPDATE outbox_events
      SET status = 'PENDING'
      WHERE status = 'PROCESSING'
        AND available_at <= ${now}
    `

    return released
  }

  /** Rows the relay may pick up now. Read-only — it takes no lock. */
  async findPending(
    limit: number,
    now: Date = new Date(),
    tx?: TxClient,
  ): Promise<OutboxEvent[]> {

    return this.db(tx).outboxEvent.findMany({
      where: {
        status: "PENDING",
        availableAt: {
          lte: now,
        },
      },
      orderBy: {
        availableAt: "asc",
      },
      take: limit,
    })
  }

  async findForOrganization(
    organizationId: string,
    filters: OutboxListFilters,
    options: { limit: number; offset: number },
    tx?: TxClient,
  ): Promise<OutboxEvent[]> {

    return this.db(tx).outboxEvent.findMany({
      where: this.buildWhere(organizationId, filters),
      orderBy: {
        createdAt: "desc",
      },
      take: options.limit,
      skip: options.offset,
    })
  }

  async countForOrganization(
    organizationId: string,
    filters: OutboxListFilters,
    tx?: TxClient,
  ): Promise<number> {

    return this.db(tx).outboxEvent.count({
      where: this.buildWhere(organizationId, filters),
    })
  }

  async countByStatus(
    organizationId: string,
    tx?: TxClient,
  ): Promise<Record<OutboxStatus, number>> {

    const groups = await this.db(tx).outboxEvent.groupBy({
      by: ["status"],
      where: {
        organizationId,
      },
      _count: {
        _all: true,
      },
    })

    const counts = Object.fromEntries(
      OUTBOX_STATUSES.map((status) => [status, 0]),
    ) as Record<OutboxStatus, number>

    for (const group of groups) {

      counts[group.status] = group._count._all
    }

    return counts
  }

  async oldestPendingAt(organizationId: string, tx?: TxClient): Promise<Date | null> {

    const row = await this.db(tx).outboxEvent.findFirst({
      where: {
        organizationId,
        status: "PENDING",
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        createdAt: true,
      },
    })

    return row ? row.createdAt : null
  }

  private buildWhere(
    organizationId: string,
    filters: OutboxListFilters,
  ): Prisma.OutboxEventWhereInput {

    return {
      organizationId,
      ...(filters.status !== undefined && { status: filters.status }),
      ...(filters.aggregateType !== undefined && { aggregateType: filters.aggregateType }),
      ...(filters.aggregateId !== undefined && { aggregateId: filters.aggregateId }),
    }
  }

  async markProcessed(
    id: string,
    at: Date = new Date(),
    tx?: TxClient,
  ): Promise<OutboxEvent> {

    return this.db(tx).outboxEvent.update({
      where: {
        id,
      },
      data: {
        status: "PROCESSED",
        processedAt: at,
      },
    })
  }

  /**
   * A delivery failed and is worth another go.
   *
   * Back to PENDING with one more attempt on the clock and `available_at`
   * pushed to `nextAttemptAt`, so the next poll that comes round after that
   * instant picks it up again.
   */
  async markFailed(
    id: string,
    nextAttemptAt: Date,
    tx?: TxClient,
  ): Promise<OutboxEvent> {

    return this.db(tx).outboxEvent.update({
      where: {
        id,
      },
      data: {
        status: "PENDING",
        availableAt: nextAttemptAt,
        attempts: {
          increment: 1,
        },
      },
    })
  }

  /**
   * A delivery failed for the last time.
   *
   * FAILED is terminal: no query in this file selects it, so the row stops
   * being retried and stays on the table as evidence. That is the point — a
   * poison row that could never be enqueued would otherwise be claimed, fail
   * and be released forever, and a relay busy spinning on one bad row is a
   * relay not draining the good ones.
   */
  async markPermanentlyFailed(
    id: string,
    at: Date = new Date(),
    tx?: TxClient,
  ): Promise<OutboxEvent> {

    return this.db(tx).outboxEvent.update({
      where: {
        id,
      },
      data: {
        status: "FAILED",
        attempts: {
          increment: 1,
        },
        processedAt: at,
      },
    })
  }
}

export { OutboxEventRepository }
