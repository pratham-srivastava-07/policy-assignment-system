import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import { policyController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import {
  denySelfScopedRole,
  denySubtreeScopedRole,
  requirePermission,
} from "../middlewares/permission"
import { rateLimit } from "../middlewares/rate-limit"

export const policyRouter = Router()

policyRouter.use(requireAuth)

policyRouter.post(
  "/",
  rateLimit.write(),
  requirePermission(PERMISSIONS.POLICY_WRITE),
  policyController.create,
)

policyRouter.get(
  "/",
  rateLimit.read(),
  requirePermission(PERMISSIONS.POLICY_READ),
  policyController.list,
)

policyRouter.get(
  "/:id",
  rateLimit.read(),
  requirePermission(PERMISSIONS.POLICY_READ),
  policyController.getById,
)

policyRouter.put(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.POLICY_WRITE),
  policyController.replace,
)

policyRouter.patch(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.POLICY_WRITE),
  policyController.patch,
)

policyRouter.delete(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.POLICY_WRITE),
  policyController.delete,
)

// Who holds this policy on a date. A self-scoped role must not see the
// organization's holders of anything; a MANAGER's subtree cannot be expressed
// as a policy-side filter, so both are refused here and directed to the
// employee-side reads they are scoped to.
policyRouter.get(
  "/:id/assignments",
  rateLimit.read(),
  requirePermission(PERMISSIONS.ASSIGNMENT_READ),
  denySelfScopedRole(),
  denySubtreeScopedRole(),
  policyController.listAssignments,
)
