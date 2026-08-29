/**
 * Repository composition root.
 *
 * Each repository module exports only its class; the singletons are constructed
 * here, so this file is the one place that decides how the data layer is wired —
 * the same shape `services/index.ts` and `controllers/index.ts` already use.
 *
 * Services import from here, never from an individual repository module.
 */

import { AssignmentRepository } from "./assignment.repository"
import { AssignmentResolutionEventRepository } from "./assignment-resolution-event.repository"
import { AuditEventRepository } from "./audit-event.repository"
import { EmployeeRepository } from "./employee.repository"
import { EmployeeAttributeHistoryRepository } from "./employee-attribute-history.repository"
import { EmployeeGroupRepository } from "./employee-group.repository"
import { GroupRepository } from "./group.repository"
import { OrganizationRepository } from "./organization.repository"
import { OrganizationMembershipRepository } from "./organization-membership.repository"
import { OutboxEventRepository } from "./outbox-event.repository"
import { PolicyRepository } from "./policy.repository"
import { PolicyCategoryRepository } from "./policy-category.repository"
import { PolicyRuleRepository } from "./policy-rule.repository"
import { PolicyRuleVersionRepository } from "./policy-rule-version.repository"
import { SessionRepository } from "./session.repository"
import { TransactionManager } from "./transaction"
import { UserRepository } from "./user.repository"

// Tenancy and identity
export const organizationRepository = new OrganizationRepository()
export const organizationMembershipRepository = new OrganizationMembershipRepository()
export const userRepository = new UserRepository()
export const sessionRepository = new SessionRepository()

// Workforce
export const employeeRepository = new EmployeeRepository()
export const employeeGroupRepository = new EmployeeGroupRepository()
export const employeeAttributeHistoryRepository = new EmployeeAttributeHistoryRepository()
export const groupRepository = new GroupRepository()

// Policies and rules
export const policyCategoryRepository = new PolicyCategoryRepository()
export const policyRepository = new PolicyRepository()
export const policyRuleRepository = new PolicyRuleRepository()
export const policyRuleVersionRepository = new PolicyRuleVersionRepository()

// Assignments
export const assignmentRepository = new AssignmentRepository()
export const assignmentResolutionEventRepository = new AssignmentResolutionEventRepository()

// History and infrastructure
export const auditEventRepository = new AuditEventRepository()
export const outboxEventRepository = new OutboxEventRepository()

// The transaction boundary itself. Services take this instead of a Prisma
// client, so opening a transaction never leaves the data layer.
export const transactionManager = new TransactionManager()

/**
 * Row types, re-exported in type position only.
 *
 * A few service helpers genuinely name what a repository hands back — the
 * employee a diff reads attributes off, the rule a snapshot serializes. Those
 * types have no DTO equivalent yet, so rather than let the service layer import
 * Prisma for them, the door they already use for everything else in the data
 * layer supplies them. `export type` means none of this survives into the
 * emitted JavaScript, and `@policy/db` stays inside `repositories/`.
 */
export type {
  Assignment,
  Employee,
  Group,
  Policy,
  PolicyCategory,
  PolicyRule,
  User,
} from "@policy/db"

// Classes and record/payload types, for constructor injection and typing.
export * from "./assignment.repository"
export * from "./assignment-resolution-event.repository"
export * from "./audit-event.repository"
export * from "./employee.repository"
export * from "./employee-attribute-history.repository"
export * from "./employee-group.repository"
export * from "./group.repository"
export * from "./organization.repository"
export * from "./organization-membership.repository"
export * from "./outbox-event.repository"
export * from "./policy.repository"
export * from "./policy-category.repository"
export * from "./policy-rule.repository"
export * from "./policy-rule-version.repository"
export * from "./session.repository"
export * from "./transaction"
export * from "./user.repository"
