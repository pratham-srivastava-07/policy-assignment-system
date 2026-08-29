import { OutboxEvent, Prisma, PrismaClass } from "@policy/db"
import { OutboxAggregateType, OutboxEventType } from "@policy/shared"
import { TxClient } from "../interfaces/db"

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
 * The relay that drains PENDING rows onto BullMQ is deliberately NOT built —
 * `claimPending` is here as the shape it will use (FOR UPDATE SKIP LOCKED so
 * several relay instances can drain the table concurrently).
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

  /** Rows the relay may pick up now. Not consumed by anything yet. */
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
}

export { OutboxEventRepository }
