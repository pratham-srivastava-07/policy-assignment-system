import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import { groupController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import { requireBackdatePermission, requirePermission } from "../middlewares/permission"
import { rateLimit } from "../middlewares/rate-limit"

export const groupRouter = Router()

groupRouter.use(requireAuth)

groupRouter.post(
  "/",
  rateLimit.write(),
  requirePermission(PERMISSIONS.GROUP_WRITE),
  groupController.create,
)

groupRouter.get(
  "/",
  rateLimit.read(),
  requirePermission(PERMISSIONS.GROUP_READ),
  groupController.list,
)

// Membership routes come before "/:id" so their literal segments are never read
// as an id. Membership changes are group writes, not employee writes — they move
// an employee between groups without altering the employee record.
groupRouter.get(
  "/:id/members",
  rateLimit.read(),
  requirePermission(PERMISSIONS.GROUP_READ),
  groupController.listMembers,
)

// Joining and leaving are effective-dated, so both carry the back-dating gate:
// a membership that starts or ends in the past rewrites which policies applied
// then. `effectiveFrom` arrives in the body here, `effectiveTo` in the query
// string on the DELETE below; the one middleware inspects both.
groupRouter.post(
  "/:id/members",
  rateLimit.write(),
  requirePermission(PERMISSIONS.GROUP_WRITE),
  requireBackdatePermission(),
  groupController.addMember,
)

groupRouter.delete(
  "/:id/members/:employeeId",
  rateLimit.write(),
  requirePermission(PERMISSIONS.GROUP_WRITE),
  requireBackdatePermission(),
  groupController.removeMember,
)

groupRouter.get(
  "/:id",
  rateLimit.read(),
  requirePermission(PERMISSIONS.GROUP_READ),
  groupController.getById,
)

groupRouter.put(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.GROUP_WRITE),
  groupController.replace,
)

groupRouter.patch(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.GROUP_WRITE),
  groupController.patch,
)

groupRouter.delete(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.GROUP_WRITE),
  groupController.delete,
)
