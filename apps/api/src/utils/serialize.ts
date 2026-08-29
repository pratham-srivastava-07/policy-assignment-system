import {
  AuditEvent,
  Employee,
  EmployeeAttributeHistory,
  Group,
  Organization,
  Policy,
  PolicyCategory,
  PolicyRule,
  PolicyRuleVersion,
  User,
} from "@policy/db"
import {
  AuditEventDTO,
  EmployeeAttributeHistoryDTO,
  EmployeeDTO,
  GroupDTO,
  GroupMemberDTO,
  PolicyCategoryDTO,
  PolicyDTO,
  PublicOrganization,
  PublicUser,
  RuleConditions,
  RuleDTO,
  RuleVersionDTO,
  tenureDaysAsOf,
  toIsoDate,
} from "@policy/shared"
import { EmployeeGroupWithEmployee } from "../repositories"

/**
 * Row -> transport mappers.
 *
 * Two rules hold everywhere here:
 *
 *   * effective dates serialize as `YYYY-MM-DD` calendar days, bookkeeping
 *     timestamps as full ISO instants — mixing the two is how a timezone offset
 *     ends up silently moving an effective date by a day;
 *   * `passwordHash` never leaves this file.
 */

export const toPublicUser = (user: User): PublicUser => ({
  id: user.id,
  email: user.email,
  name: user.name,
  employeeId: user.employeeId,
  createdAt: user.createdAt.toISOString(),
  updatedAt: user.updatedAt.toISOString(),
})

export const toPublicOrganization = (organization: Organization): PublicOrganization => ({
  id: organization.id,
  name: organization.name,
})

/**
 * `tenureDays` is computed here, on every read, from `hireDate`. It is never a
 * column — a stored tenure would be wrong the day after it was written.
 */
export const toEmployeeDTO = (employee: Employee, asOf: Date = new Date()): EmployeeDTO => ({
  id: employee.id,
  organizationId: employee.organizationId,
  name: employee.name,
  email: employee.email,
  hireDate: toIsoDate(employee.hireDate),
  employmentType: employee.employmentType,
  department: employee.department,
  role: employee.role,
  location: employee.location,
  state: employee.state,
  country: employee.country,
  isManager: employee.isManager,
  tenureDays: tenureDaysAsOf(employee.hireDate, asOf),
  createdAt: employee.createdAt.toISOString(),
  updatedAt: employee.updatedAt.toISOString(),
})

export const toGroupDTO = (group: Group): GroupDTO => ({
  id: group.id,
  organizationId: group.organizationId,
  name: group.name,
  description: group.description,
  createdAt: group.createdAt.toISOString(),
  updatedAt: group.updatedAt.toISOString(),
})

export const toGroupMemberDTO = (row: EmployeeGroupWithEmployee): GroupMemberDTO => ({
  id: row.id,
  groupId: row.groupId,
  employeeId: row.employeeId,
  employeeName: row.employee.name,
  employeeEmail: row.employee.email,
  effectiveFrom: toIsoDate(row.effectiveFrom),
  effectiveTo: row.effectiveTo ? toIsoDate(row.effectiveTo) : null,
  createdAt: row.createdAt.toISOString(),
})

export const toAttributeHistoryDTO = (
  row: EmployeeAttributeHistory,
): EmployeeAttributeHistoryDTO => ({
  id: row.id,
  employeeId: row.employeeId,
  attribute: row.attribute,
  oldValue: row.oldValue,
  newValue: row.newValue,
  effectiveFrom: toIsoDate(row.effectiveFrom),
  effectiveTo: row.effectiveTo ? toIsoDate(row.effectiveTo) : null,
  changedBy: row.changedBy,
  createdAt: row.createdAt.toISOString(),
})

export const toPolicyCategoryDTO = (category: PolicyCategory): PolicyCategoryDTO => ({
  id: category.id,
  organizationId: category.organizationId,
  name: category.name,
  key: category.key,
  cardinality: category.cardinality,
  createdAt: category.createdAt.toISOString(),
  updatedAt: category.updatedAt.toISOString(),
})

export const toPolicyDTO = (policy: Policy): PolicyDTO => ({
  id: policy.id,
  organizationId: policy.organizationId,
  categoryId: policy.categoryId,
  name: policy.name,
  description: policy.description,
  status: policy.status,
  createdAt: policy.createdAt.toISOString(),
  updatedAt: policy.updatedAt.toISOString(),
})

export const toRuleDTO = (rule: PolicyRule): RuleDTO => ({
  id: rule.id,
  organizationId: rule.organizationId,
  policyId: rule.policyId,
  employeeId: rule.employeeId,
  name: rule.name,
  ruleType: rule.ruleType,
  priority: rule.priority,
  conditions: rule.conditions as unknown as RuleConditions,
  enabled: rule.enabled,
  effectiveFrom: toIsoDate(rule.effectiveFrom),
  effectiveTo: rule.effectiveTo ? toIsoDate(rule.effectiveTo) : null,
  version: rule.version,
  createdAt: rule.createdAt.toISOString(),
  updatedAt: rule.updatedAt.toISOString(),
})

export const toRuleVersionDTO = (version: PolicyRuleVersion): RuleVersionDTO => ({
  id: version.id,
  ruleId: version.ruleId,
  version: version.version,
  policyId: version.policyId,
  employeeId: version.employeeId,
  name: version.name,
  ruleType: version.ruleType,
  priority: version.priority,
  conditions: version.conditions as unknown as RuleConditions,
  enabled: version.enabled,
  effectiveFrom: toIsoDate(version.effectiveFrom),
  effectiveTo: version.effectiveTo ? toIsoDate(version.effectiveTo) : null,
  createdBy: version.createdBy,
  createdAt: version.createdAt.toISOString(),
})

export const toAuditEventDTO = (event: AuditEvent): AuditEventDTO => ({
  id: event.id,
  organizationId: event.organizationId,
  actorId: event.actorId,
  action: event.action,
  entityType: event.entityType,
  entityId: event.entityId,
  beforeState: event.beforeState,
  afterState: event.afterState,
  metadata: event.metadata,
  createdAt: event.createdAt.toISOString(),
})
