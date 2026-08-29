import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import { ruleController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import { requirePermission } from "../middlewares/permission"
import { rateLimit } from "../middlewares/rate-limit"

export const overrideRouter = Router()

overrideRouter.use(requireAuth)

// Overrides are created under the employee they target
// (POST /employees/:id/overrides) and revoked here by their own id.
//
// Revoking is the same soft delete every rule gets: disabled and end-dated. The
// assignment it produced keeps its explanation.
//
// Gated on assignment:override rather than rule:write — an override is a
// deliberate departure from automatic policy, and granting someone the ability
// to author ordinary rules should not silently grant that too.
overrideRouter.delete(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.ASSIGNMENT_OVERRIDE),
  ruleController.deleteOverride,
)
