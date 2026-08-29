import { Router } from "express"
import { authRouter } from "./auth"
import { employeeRouter } from "./employee"
import { groupRouter } from "./group"
import { userRouter } from "./user"

export const router = Router()

router.use("/auth", authRouter)
router.use("/user", userRouter)
router.use("/employees", employeeRouter)
router.use("/groups", groupRouter)
