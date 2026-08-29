import { Router } from "express"
import { authController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import { rateLimit } from "../middlewares/rate-limit"

export const authRouter = Router()

// Public: these are how a caller obtains a session in the first place, which
// also makes them the only brute-forceable surface. The AUTH tier is keyed by IP
// because there is no identity yet to key on, and is far stricter than anything
// else in the application.
authRouter.post("/signup", rateLimit.auth(), authController.signup)
authRouter.post("/login", rateLimit.auth(), authController.login)

// Authenticated: both act on the session the bearer token names, so they need no
// permission beyond holding a valid session — every role may end its own session
// and read its own identity.
authRouter.post("/logout", requireAuth, rateLimit.write(), authController.logout)
authRouter.get("/me", requireAuth, rateLimit.read(), authController.me)
