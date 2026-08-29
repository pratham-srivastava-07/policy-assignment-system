import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import { userController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import { requirePermission } from "../middlewares/permission"
import { rateLimit } from "../middlewares/rate-limit"

export const userRouter = Router()

// Users are reachable only through the caller's organization membership, so
// there is no unauthenticated read here. Account creation happens at
// /auth/signup; this router adds teammates to an existing organization, which is
// why it is gated on member:* rather than employee:*.
userRouter.use(requireAuth)

userRouter.post(
  "/",
  rateLimit.write(),
  requirePermission(PERMISSIONS.MEMBER_WRITE),
  userController.createUser,
)

userRouter.get(
  "/",
  rateLimit.read(),
  requirePermission(PERMISSIONS.MEMBER_READ),
  userController.listUsers,
)

// Before /:id, else "search" is read as an id.
userRouter.get(
  "/search",
  rateLimit.read(),
  requirePermission(PERMISSIONS.MEMBER_READ),
  userController.findByEmail,
)

userRouter.get(
  "/:id",
  rateLimit.read(),
  requirePermission(PERMISSIONS.MEMBER_READ),
  userController.getUserById,
)

userRouter.patch(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.MEMBER_WRITE),
  userController.updateUser,
)

userRouter.delete(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.MEMBER_WRITE),
  userController.delete,
)
