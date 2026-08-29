import { Queue } from "bullmq"
import IORedis from "ioredis"
import { env } from "./config/env"

/** The one queue. Every outbox row becomes a job on it. */
export const RECONCILIATION_QUEUE = "reconciliation"

/** The single job name on that queue. */
export const RECONCILE_EMPLOYEE_JOB = "reconcile-employee"

/**
 * What a job carries.
 *
 * Deliberately thin. The payload names the employee and the day, and everything
 * else — attributes, group membership, which rules exist — is re-read by the
 * resolution service when the job runs. A payload that carried the employee's
 * state would be a snapshot of the moment the change was made, and by the time
 * the job runs that snapshot can be stale; re-reading is what makes a late or
 * repeated delivery produce the same correct answer as a prompt one.
 *
 * `outboxEventId`, `eventType` and `changedAttributes` are along for
 * traceability: a job in the failed set should say which row produced it and
 * what happened.
 */
export interface ReconcileEmployeeJob {
  outboxEventId: string
  organizationId: string
  employeeId: string
  eventType: string
  /** `YYYY-MM-DD`, when the producing event named one. */
  asOf?: string
  /** Present on EMPLOYEE_ATTRIBUTES_CHANGED. Recorded, not yet acted on. */
  changedAttributes?: string[]
}

/**
 * The Redis connection the queue and the worker share.
 *
 * `maxRetriesPerRequest: null` is mandatory for any connection BullMQ uses for
 * a Worker: the blocking commands a worker issues sit open for seconds at a
 * time, and ioredis' default retry cap would abort them as failed requests.
 * BullMQ refuses to start a worker on a connection without it.
 */
export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
})

export const reconciliationQueue = new Queue<ReconcileEmployeeJob>(RECONCILIATION_QUEUE, {
  connection,
  defaultJobOptions: {
    attempts: env.RECONCILIATION_JOB_ATTEMPTS,
    backoff: {
      type: "exponential",
      delay: 1000,
    },
    // Completed jobs are not the record — the outbox row is, and it keeps its
    // own status and audit trail. Holding a large completed set in Redis buys
    // nothing and costs memory.
    removeOnComplete: 1000,
    // Failures are kept: a job nobody could process is a thing to look at.
    removeOnFail: false,
  },
})
