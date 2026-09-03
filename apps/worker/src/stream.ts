import IORedis from "ioredis"
import {
  AssignmentDTO,
  ReconciliationResultDTO,
  ReconciliationStreamEvent,
  StreamAssignmentDTO,
  reconciliationChannel,
} from "@policy/shared"
import { env } from "./config/env"

/**
 * Publishes what reconciliation just did, so a dashboard can watch it happen.
 *
 * Deliberately fire-and-forget and deliberately downstream of the write: the
 * outbox row is already PROCESSED and the assignments are already committed by
 * the time this runs. A Redis that is down loses the notification, never the
 * work — which is the only acceptable relationship between a durable pipeline
 * and a presentation channel.
 *
 * One channel per organization, so the API subscribes to exactly the tenants it
 * has connected clients for and never receives another tenant's traffic at all.
 */

const toStreamAssignment = (assignment: AssignmentDTO): StreamAssignmentDTO => ({
  assignmentId: assignment.id,
  policyId: assignment.policyId,
  policyName: assignment.policyName,
  categoryId: assignment.categoryId,
  categoryName: assignment.categoryName,
  cardinality: assignment.cardinality,
  sourceRuleId: assignment.sourceRuleId,
  sourceRuleName: assignment.sourceRuleName,
  sourceRuleVersion: assignment.sourceRuleVersion,
  resolutionStatus: assignment.resolutionStatus,
  effectiveFrom: assignment.effectiveFrom,
  effectiveTo: assignment.effectiveTo,
})

export class ReconciliationPublisher {

  private redis: IORedis | null = null

  private warned = false

  private open(): IORedis {

    if (!this.redis) {

      this.redis = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 2 })

      this.redis.on("error", (error) => {

        // Once per process. A publisher that logs every reconnect attempt drowns
        // out the reconciliation log this process exists to produce.
        if (this.warned) {

          return
        }

        this.warned = true

        console.warn("[stream] publisher connection error; live updates degraded", error)
      })
    }

    return this.redis
  }

  async publish(
    result: ReconciliationResultDTO,
    context: {
      organizationId: string
      employeeName: string
      trigger: string
      outboxEventId: string | null
    },
  ): Promise<void> {

    const event: ReconciliationStreamEvent = {
      id: `${Date.now()}-${result.employeeId}`,
      organizationId: context.organizationId,
      employeeId: result.employeeId,
      employeeName: context.employeeName,
      occurredAt: new Date().toISOString(),
      asOf: result.asOf,
      trigger: context.trigger,
      outboxEventId: context.outboxEventId,
      added: result.added.map(toStreamAssignment),
      removed: result.removed.map(toStreamAssignment),
      unchangedCount: result.unchanged.length,
    }

    try {

      await this.open().publish(
        reconciliationChannel(context.organizationId),
        JSON.stringify(event),
      )
    } catch (error) {

      // Swallowed on purpose. The reconciliation is committed; failing the job
      // here would retry work that is already done in order to resend a
      // notification, which is a worse outcome than a missing feed row.
      console.warn(`[stream] could not publish for employee ${result.employeeId}`, error)
    }
  }

  async close(): Promise<void> {

    if (!this.redis) {

      return
    }

    await this.redis.quit()

    this.redis = null
  }
}
