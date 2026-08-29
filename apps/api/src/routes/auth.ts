import { Router } from "express"
import { authController } from "../controllers"
import { requireAuth } from "../middlewares/auth"

export const authRouter = Router()

// Public: these are how a caller obtains a session in the first place.
authRouter.post("/signup", authController.signup)
authRouter.post("/login", authController.login)

// Authenticated: both act on the session the bearer token names.
authRouter.post("/logout", requireAuth, authController.logout)
authRouter.get("/me", requireAuth, authController.me)
