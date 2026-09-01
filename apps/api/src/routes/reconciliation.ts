import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import { assignmentController, reconciliationController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import { requirePermission } from "../middlewares/permission"
import { rateLimit } from "../middlewares/rate-limit"

export const reconciliationRouter = Router()

reconciliationRouter.use(requireAuth)

// Synchronous materialization for one employee. The asynchronous path — an
// outbox row drained by a worker — is what every other write enqueues; this is
// the manual trigger for the same work, and it is idempotent for the same
// reason: it writes the difference, not a replacement.
//
// EXPENSIVE: it runs the engine and then writes. Gated on assignment:reconcile
// rather than assignment:override, because materializing derived state is not
// the same act as deliberately overriding it.
reconciliationRouter.post(
  "/employees/:id",
  rateLimit.expensive(),
  requirePermission(PERMISSIONS.ASSIGNMENT_RECONCILE),
  assignmentController.reconcile,
)

// Read-only view of the outbox: how much reconciliation is pending, and which
// rows have failed for good. Gated on the same permission as triggering one,
// because knowing the queue is empty or stuck is an operator's question.
reconciliationRouter.get(
  "/status",
  rateLimit.read(),
  requirePermission(PERMISSIONS.ASSIGNMENT_RECONCILE),
  reconciliationController.status,
)

reconciliationRouter.get(
  "/events",
  rateLimit.read(),
  requirePermission(PERMISSIONS.ASSIGNMENT_RECONCILE),
  reconciliationController.listEvents,
)
