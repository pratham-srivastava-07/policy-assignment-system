import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import { policyController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import { requirePermission } from "../middlewares/permission"
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
