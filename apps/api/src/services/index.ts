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
  userRepository,
} from "../repositories"
import { AccessService } from "./access"
import { AuditService } from "./audit"
import { AuthService } from "./auth"
import { EmployeeService } from "./employee"
import { GroupService } from "./group"
import { PolicyCategoryService, PolicyService } from "./policy"
import { ResolutionService } from "./resolution"
import { RuleService } from "./rule"
import { UserService } from "./user"

export const authService = new AuthService(
  organizationRepository,
  userRepository,
  organizationMembershipRepository,
  sessionRepository,
  auditEventRepository,
)

export const userService = new UserService(
  userRepository,
  organizationMembershipRepository,
  employeeRepository,
  auditEventRepository,
)

export const employeeService = new EmployeeService(
  employeeRepository,
  employeeAttributeHistoryRepository,
  employeeGroupRepository,
  assignmentRepository,
  auditEventRepository,
  outboxEventRepository,
)

export const groupService = new GroupService(
  groupRepository,
  employeeGroupRepository,
  employeeRepository,
  auditEventRepository,
  outboxEventRepository,
)

export const policyCategoryService = new PolicyCategoryService(
  policyCategoryRepository,
  auditEventRepository,
)

export const policyService = new PolicyService(
  policyRepository,
  policyCategoryRepository,
  auditEventRepository,
)

export const ruleService = new RuleService(
  policyRuleRepository,
  policyRuleVersionRepository,
  policyRepository,
  employeeRepository,
  employeeGroupRepository,
  auditEventRepository,
  outboxEventRepository,
)

export const resolutionService = new ResolutionService(
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

export { AccessService } from "./access"
export { AuditService } from "./audit"
export { AuthService } from "./auth"
export { EmployeeService } from "./employee"
export { GroupService } from "./group"
export { PolicyCategoryService, PolicyService } from "./policy"
export { ResolutionService } from "./resolution"
export { RuleService } from "./rule"
export { UserService } from "./user"
