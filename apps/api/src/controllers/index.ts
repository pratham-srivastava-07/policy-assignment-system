/**
 * Controller composition root: services in, controllers out.
 */

import {
  accessService,
  auditService,
  authService,
  employeeService,
  groupService,
  policyCategoryService,
  policyService,
  reconciliationService,
  resolutionService,
  ruleService,
  userService,
} from "../services"
import { AccessController, AssignmentController } from "./assignment"
import { AuditController } from "./audit"
import { AuthController } from "./auth"
import { EmployeeController } from "./employee"
import { GroupController } from "./group"
import { PolicyCategoryController, PolicyController } from "./policy"
import { ReconciliationController } from "./reconciliation"
import { RuleController } from "./rule"
import { UserController } from "./user"

export const authController = new AuthController(authService)
export const userController = new UserController(userService)
export const employeeController = new EmployeeController(employeeService)
export const groupController = new GroupController(groupService)
export const policyCategoryController = new PolicyCategoryController(policyCategoryService)
export const policyController = new PolicyController(policyService)
export const ruleController = new RuleController(ruleService)
export const assignmentController = new AssignmentController(resolutionService)
export const accessController = new AccessController(accessService)
export const auditController = new AuditController(auditService)
export const reconciliationController = new ReconciliationController(reconciliationService)

export { AccessController, AssignmentController } from "./assignment"
export { AuditController } from "./audit"
export { AuthController } from "./auth"
export { EmployeeController } from "./employee"
export { GroupController } from "./group"
export { PolicyCategoryController, PolicyController } from "./policy"
export { ReconciliationController } from "./reconciliation"
export { RuleController } from "./rule"
export { UserController } from "./user"
