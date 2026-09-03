/**
 * Service composition root: repositories in, services out.
 */

import {
  assignmentRepository,
  assignmentResolutionEventRepository,
  auditEventRepository,
  employeeAttributeHistoryRepository,
  employeeGroupRepository,
  employeeRepository,
  groupRepository,
  organizationMembershipRepository,
  organizationRepository,
  outboxEventRepository,
  policyCategoryRepository,
  policyRepository,
  policyRuleRepository,
  policyRuleVersionRepository,
  sessionRepository,
  transactionManager,
  userRepository,
} from "@policy/core"
import { AccessService } from "./access"
import { AuditService } from "./audit"
import { AuthService } from "./auth"
import { EmployeeService } from "./employee"
import { GroupService } from "./group"
import { PolicyCategoryService, PolicyService } from "./policy"
import { ReconciliationService } from "./reconciliation"
import { ResolutionService } from "@policy/core"
import { RuleService } from "./rule"
import { UserService } from "./user"

export const authService = new AuthService(
  transactionManager,
  organizationRepository,
  userRepository,
  organizationMembershipRepository,
  sessionRepository,
  auditEventRepository,
)

export const userService = new UserService(
  transactionManager,
  userRepository,
  organizationMembershipRepository,
  employeeRepository,
  auditEventRepository,
)

export const employeeService = new EmployeeService(
  transactionManager,
  employeeRepository,
  employeeAttributeHistoryRepository,
  employeeGroupRepository,
  assignmentRepository,
  auditEventRepository,
  outboxEventRepository,
)

export const groupService = new GroupService(
  transactionManager,
  groupRepository,
  employeeGroupRepository,
  employeeRepository,
  auditEventRepository,
  outboxEventRepository,
)

export const policyCategoryService = new PolicyCategoryService(
  transactionManager,
  policyCategoryRepository,
  auditEventRepository,
)

export const policyService = new PolicyService(
  transactionManager,
  policyRepository,
  policyCategoryRepository,
  auditEventRepository,
  assignmentRepository,
)

export const ruleService = new RuleService(
  transactionManager,
  policyRuleRepository,
  policyRuleVersionRepository,
  policyRepository,
  employeeRepository,
  employeeGroupRepository,
  auditEventRepository,
  outboxEventRepository,
)

export const resolutionService = new ResolutionService(
  transactionManager,
  employeeRepository,
  employeeGroupRepository,
  policyRuleRepository,
  assignmentRepository,
  assignmentResolutionEventRepository,
  auditEventRepository,
)

// Access composes the rule writer with the assignment reader rather than
// duplicating either: a grant IS a manual override rule, and access IS the
// assignments in one category.
export const accessService = new AccessService(
  policyCategoryRepository,
  policyRepository,
  assignmentRepository,
  ruleService,
)

export const auditService = new AuditService(auditEventRepository, employeeRepository)
export const reconciliationService = new ReconciliationService(outboxEventRepository)

export { reconciliationStreamHub, ReconciliationStreamHub } from "./reconciliation-stream"

export { AccessService } from "./access"
export { AuditService } from "./audit"
export { ReconciliationService } from "./reconciliation"
export { AuthService } from "./auth"
export { EmployeeService } from "./employee"
export { GroupService } from "./group"
export { PolicyCategoryService, PolicyService } from "./policy"
export { ResolutionService } from "@policy/core"
export { RuleService } from "./rule"
export { UserService } from "./user"
