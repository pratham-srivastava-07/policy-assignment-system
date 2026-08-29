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
  AssignmentDTO,
  AuditEventDTO,
  EmployeeAttributeHistoryDTO,
  EmployeeDTO,
  GroupDTO,
  GroupMemberDTO,
  PolicyCategoryDTO,
  PolicyDTO,
  PublicOrganization,
  PublicUser,
  ResolutionTrailEntryDTO,
  ResolvedPolicyDTO,
  RuleConditions,
  RuleDTO,
  RuleVersionDTO,
  tenureDaysAsOf,
  toIsoDate,
} from "@policy/shared"
import { AssignmentWithContext, EmployeeGroupWithEmployee } from "../repositories"
import { ResolvedPolicy, RuleTrailEntry } from "../engine"

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
  status: employee.status,
  terminatedOn: employee.terminatedOn ? toIsoDate(employee.terminatedOn) : null,
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

/**
 * An assignment, flattened with the names a reader needs.
 *
 * The policy, category and source rule version travel with the row because an
 * assignment identified only by uuids explains nothing — and explaining is what
 * this table is for.
 */
export const toAssignmentDTO = (assignment: AssignmentWithContext): AssignmentDTO => ({
  id: assignment.id,
  organizationId: assignment.organizationId,
  employeeId: assignment.employeeId,
  policyId: assignment.policyId,
  policyName: assignment.policy.name,
  categoryId: assignment.categoryId,
  categoryKey: assignment.category.key,
  categoryName: assignment.category.name,
  cardinality: assignment.cardinality,
  sourceRuleId: assignment.sourceRuleId,
  sourceRuleVersion: assignment.sourceRuleVersion,
  sourceRuleName: assignment.sourceRuleVersionRow.name,
  effectiveFrom: toIsoDate(assignment.effectiveFrom),
  effectiveTo: assignment.effectiveTo ? toIsoDate(assignment.effectiveTo) : null,
  resolutionStatus: assignment.resolutionStatus,
  resolutionReason: assignment.resolutionReason,
  createdAt: assignment.createdAt.toISOString(),
  updatedAt: assignment.updatedAt.toISOString(),
})

/** One rule the engine considered, on its way out over HTTP. */
export const toTrailEntryDTO = (entry: RuleTrailEntry): ResolutionTrailEntryDTO => ({
  ruleId: entry.ruleId,
  ruleVersion: entry.ruleVersion,
  ruleName: entry.ruleName,
  ruleType: entry.ruleType,
  priority: entry.priority,
  policyId: entry.policyId,
  categoryId: entry.categoryId,
  decision: entry.decision,
  reason: entry.reason,
  matchedClauses: entry.matchedClauses,
  failedClause: entry.failedClause,
})

/** A policy the engine says should apply, before anything is materialized. */
export const toResolvedPolicyDTO = (resolved: ResolvedPolicy): ResolvedPolicyDTO => ({
  policyId: resolved.policyId,
  policyName: resolved.policyName,
  categoryId: resolved.categoryId,
  categoryKey: resolved.categoryKey,
  cardinality: resolved.cardinality,
  ruleId: resolved.ruleId,
  ruleVersion: resolved.ruleVersion,
  ruleName: resolved.ruleName,
  ruleType: resolved.ruleType,
  priority: resolved.priority,
  resolutionStatus: resolved.resolutionStatus,
  reason: resolved.reason,
})
