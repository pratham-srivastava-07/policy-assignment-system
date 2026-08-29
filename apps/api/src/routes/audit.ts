import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import { auditController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import { requirePermission } from "../middlewares/permission"
import { rateLimit } from "../middlewares/rate-limit"

export const auditRouter = Router()

auditRouter.use(requireAuth)

// Read-only by design: audit rows are written inside the transaction that made
// the change they describe, never over HTTP.
auditRouter.get(
  "/",
  rateLimit.read(),
  requirePermission(PERMISSIONS.AUDIT_READ),
  auditController.list,
)
