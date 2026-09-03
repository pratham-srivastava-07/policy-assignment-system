import { PrismaClass } from "@policy/db"
import {
  ResolutionService,
  RuleFanOutService,
  assignmentRepository,
  assignmentResolutionEventRepository,
  auditEventRepository,
  employeeGroupRepository,
  employeeRepository,
  outboxEventRepository,
  policyRuleRepository,
  policyRuleVersionRepository,
  transactionManager,
} from "@policy/core"
import { env } from "./config/env"
import { ReconciliationProcessor } from "./processor"
import { OutboxRelay } from "./relay"
import { ReconciliationPublisher } from "./stream"
import { connection, reconciliationQueue } from "./queue"

/**
 * The reconciliation worker.
 *
 * Two halves of one pipeline, in one process:
 *
 *     services write outbox rows (in their own transactions)
 *                     │
 *                     ▼
 *     OutboxRelay ── claims PENDING rows, enqueues one job each
 *                     │
 *                     ▼
 *     ReconciliationProcessor ── calls ResolutionService.reconcile
 *
 * They are separate objects and separate concerns, and either could be moved to
 * its own process without changing the other: the relay's only output is a job
 * on Redis, and the processor's only input is one.
 *
 * Neither half lives in the API. Reconciliation is unbounded background work
 * with retries, and putting it in the request process would let a backlog of it
 * compete with user-facing requests for the same event loop.
 */

/**
 * Composition root.
 *
 * The repository singletons come from `@policy/core`, which is the same set the
 * API uses, so both processes talk to one data layer. The service is wired here
 * rather than imported ready-made because a worker's dependency list is worth
 * being able to read: this is exactly what reconciliation touches, and the
 * compiler checks it against the constructor the API satisfies too.
 */
const resolutionService = new ResolutionService(
  transactionManager,
  employeeRepository,
  employeeGroupRepository,
  policyRuleRepository,
  assignmentRepository,
  assignmentResolutionEventRepository,
  auditEventRepository,
)

/**
 * Derives who a rule change affects.
 *
 * Wired here rather than inside the relay because it is a data-layer question,
 * not a queueing one: the relay knows it must fan a rule row out, and this knows
 * to whom.
 */
const ruleFanOutService = new RuleFanOutService(
  policyRuleRepository,
  policyRuleVersionRepository,
  employeeRepository,
  employeeGroupRepository,
  assignmentRepository,
)

const relay = new OutboxRelay(
  outboxEventRepository,
  reconciliationQueue,
  ruleFanOutService,
  employeeGroupRepository,
)

/**
 * Announces what reconciliation did, for the dashboard's live feed.
 *
 * Wired at this level rather than inside the processor so that the notification
 * channel stays visibly separate from the work: this is the only dependency the
 * worker has that it can lose entirely without being wrong.
 */
const reconciliationPublisher = new ReconciliationPublisher()

const processor = new ReconciliationProcessor(
  resolutionService,
  employeeRepository,
  reconciliationPublisher,
)

let shuttingDown = false

/**
 * Wind down in dependency order, so nothing is closed while something still
 * needs it:
 *
 *   1. stop the relay polling, and wait for the batch it is mid-way through —
 *      it still needs the queue to finish that batch;
 *   2. close the BullMQ worker, which stops it taking new jobs and waits for the
 *      jobs in flight — those still need Prisma;
 *   3. close the queue, now that nothing will enqueue again;
 *   4. close the Redis connection, now that neither the queue nor the worker
 *      holds it;
 *   5. disconnect Prisma, now that no job is mid-transaction.
 *
 * Anything the relay claimed but did not enqueue is still PROCESSING with a
 * lease, so the next start reclaims it. Nothing is lost by stopping here.
 */
const shutdown = async (signal: string): Promise<void> => {

  if (shuttingDown) {

    return
  }

  shuttingDown = true

  console.log(`[worker] ${signal} received, shutting down`)

  try {

    await relay.stop()

    await processor.stop()

    await reconciliationQueue.close()

    await connection.quit()

    await PrismaClass.getInstance().$disconnect()

    console.log("[worker] stopped cleanly")

    process.exit(0)
  } catch (error) {

    console.error("[worker] shutdown failed", error)

    process.exit(1)
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"))

process.on("SIGTERM", () => void shutdown("SIGTERM"))

// An unhandled rejection in a background process is a silent stall: there is no
// request to fail, so without this it would just stop doing work. Log it loudly
// and let the supervisor restart a process that cannot be trusted any more.
process.on("unhandledRejection", (reason) => {

  console.error("[worker] unhandled rejection", reason)

  void shutdown("unhandledRejection")
})

const main = (): void => {

  console.log(`[worker] starting in ${env.NODE_ENV}`)

  processor.start()

  relay.start()
}

main()
