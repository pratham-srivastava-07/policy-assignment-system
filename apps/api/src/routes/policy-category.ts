import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import { policyCategoryController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import { requirePermission } from "../middlewares/permission"
import { rateLimit } from "../middlewares/rate-limit"

export const policyCategoryRouter = Router()

// Categories carry cardinality, which is the rule that decides whether an
// employee may hold one policy here or several. Org-scoped like everything else.
policyCategoryRouter.use(requireAuth)

policyCategoryRouter.post(
  "/",
  rateLimit.write(),
  requirePermission(PERMISSIONS.POLICY_WRITE),
  policyCategoryController.create,
)

policyCategoryRouter.get(
  "/",
  rateLimit.read(),
  requirePermission(PERMISSIONS.POLICY_READ),
  policyCategoryController.list,
)

policyCategoryRouter.get(
  "/:id",
  rateLimit.read(),
  requirePermission(PERMISSIONS.POLICY_READ),
  policyCategoryController.getById,
)

policyCategoryRouter.patch(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.POLICY_WRITE),
  policyCategoryController.patch,
)

policyCategoryRouter.delete(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.POLICY_WRITE),
  policyCategoryController.delete,
)
