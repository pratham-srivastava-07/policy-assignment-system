import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import { assignmentController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import { denySelfScopedRole, requirePermission } from "../middlewares/permission"
import { rateLimit } from "../middlewares/rate-limit"

export const assignmentRouter = Router()

assignmentRouter.use(requireAuth)

// The batch read: ?employeeIds=a,b,c&asOf=YYYY-MM-DD. There is no unfiltered
// "every assignment in the organization" — that is a report, not a lookup.
//
// EXPENSIVE because it resolves policy state across an arbitrary set of
// employees. A self-scoped role is refused here and directed to
// GET /employees/:id/assignments, which is narrowed to them.
assignmentRouter.get(
  "/",
  rateLimit.expensive(),
  requirePermission(PERMISSIONS.ASSIGNMENT_READ),
  denySelfScopedRole(),
  assignmentController.list,
)

// The explanation is a stored trail, not a re-evaluation, so this is an ordinary
// read despite belonging to the engine's surface.
assignmentRouter.get(
  "/:id/explanation",
  rateLimit.read(),
  requirePermission(PERMISSIONS.ASSIGNMENT_READ),
  assignmentController.explain,
)
