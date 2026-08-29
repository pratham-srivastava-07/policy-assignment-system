import { Router } from "express"
import { accessRouter } from "./access"
import { assignmentRouter } from "./assignment"
import { auditRouter } from "./audit"
import { authRouter } from "./auth"
import { employeeRouter } from "./employee"
import { groupRouter } from "./group"
import { overrideRouter } from "./override"
import { policyRouter } from "./policy"
import { policyCategoryRouter } from "./policy-category"
import { reconciliationRouter } from "./reconciliation"
import { ruleRouter } from "./rule"
import { userRouter } from "./user"

export const router = Router()

router.use("/auth", authRouter)
router.use("/user", userRouter)

// Workforce
router.use("/employees", employeeRouter)
router.use("/groups", groupRouter)

// Policy configuration
router.use("/policy-categories", policyCategoryRouter)
router.use("/policies", policyRouter)
router.use("/rules", ruleRouter)
router.use("/overrides", overrideRouter)

// Derived policy state
router.use("/assignments", assignmentRouter)
router.use("/access", accessRouter)
router.use("/reconciliation", reconciliationRouter)

// History
router.use("/audit-events", auditRouter)
