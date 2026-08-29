import { Router } from "express"
import { userController } from "../controllers"
import { requireAuth } from "../middlewares/auth"

export const userRouter = Router()

// Users are reachable only through the caller's organization membership, so
// there is no unauthenticated read here. Account creation happens at
// /auth/signup; this router adds teammates to an existing organization.
userRouter.use(requireAuth)

userRouter.post("/", userController.createUser)
userRouter.get("/", userController.listUsers)
userRouter.get("/search", userController.findByEmail) // before /:id, else "search" is read as an id
userRouter.get("/:id", userController.getUserById)
userRouter.patch("/:id", userController.updateUser)
userRouter.delete("/:id", userController.delete)
