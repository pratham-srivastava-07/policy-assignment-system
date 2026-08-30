import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import { accessController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import {
  requirePermission,
  requireSelfOrPermission,
  requireSubtreeScope,
} from "../middlewares/permission"
import { rateLimit } from "../middlewares/rate-limit"

export const accessRouter = Router()

accessRouter.use(requireAuth)

// GET /access?emp=<employeeId>&asOf=YYYY-MM-DD
//
// The employee id arrives as a query parameter here rather than a path segment,
// so both scope checks read "emp" from the query: an EMPLOYEE may ask what they
// themselves can reach, a MANAGER what anyone in their reporting line can reach,
// and no more.
accessRouter.get(
  "/",
  rateLimit.read(),
  requireSelfOrPermission("emp", PERMISSIONS.ASSIGNMENT_READ),
  requireSubtreeScope("emp"),
  accessController.list,
)

// No POST. Access is derived from assignments, and an assignment written by hand
// would be removed by the next reconciliation with nothing to explain it. PUT and
// PATCH create the MANUAL override rule that produces the access instead — which
// is why both are gated on assignment:override.
accessRouter.put(
  "/",
  rateLimit.write(),
  requirePermission(PERMISSIONS.ASSIGNMENT_OVERRIDE),
  accessController.put,
)

accessRouter.patch(
  "/",
  rateLimit.write(),
  requirePermission(PERMISSIONS.ASSIGNMENT_OVERRIDE),
  accessController.patch,
)
