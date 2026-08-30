import {
  Cardinality,
  EmployeeStatus,
  OrganizationRole,
  PolicyStatus,
  ResolutionDecision,
  ResolutionStatus,
  RuleType,
} from "./enums"
import { ConditionClause, RuleConditions } from "./conditions"
import { TrackedEmployeeAttribute } from "./constants"

/**
 * Transport contracts.
 *
 * These describe what crosses the HTTP boundary — never a Prisma model. Dates
 * are ISO strings here: effective dates as `YYYY-MM-DD` (a calendar day),
 * bookkeeping timestamps as full ISO-8601 instants.
 */

/** `YYYY-MM-DD`. An org-local calendar day, not an instant. */
export type IsoDate = string

/** Full ISO-8601 instant. */
export type IsoDateTime = string

/** The response envelope every endpoint returns. */
export interface ApiSuccess<T> {
  success: true
  data: T
}

export interface ApiFailure {
  success: false
  message: string
  code?: string
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure

/** A page of results. */
export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

/**
 * An effective-dated range, closed-open: valid while
 * `effectiveFrom <= asOf AND (effectiveTo IS NULL OR effectiveTo > asOf)`.
 */
export interface EffectivePeriod {
  effectiveFrom: IsoDate
  effectiveTo: IsoDate | null
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * The authenticated identity attached to every request.
 *
 * `organizationId` comes from the session row and nowhere else — never from a
 * path, body or query parameter. This is the multi-tenancy boundary.
 */
export interface AuthContext {
  userId: string
  sessionId: string
  organizationId: string
  role: OrganizationRole
  /** The employee this login represents, if any. */
  employeeId: string | null
}

export interface PublicUser {
  id: string
  email: string
  name: string
  employeeId: string | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface PublicOrganization {
  id: string
  name: string
}

export interface AuthSessionDTO {
  user: PublicUser
  organization: PublicOrganization
  role: OrganizationRole
  /** The bearer token. Returned once, at issue time; only its hash is stored. */
  token: string
  expiresAt: IsoDateTime
}

export interface MeDTO {
  user: PublicUser
  organization: PublicOrganization
  role: OrganizationRole
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export interface EmployeeDTO {
  id: string
  organizationId: string
  name: string
  email: string
  hireDate: IsoDate
  employmentType: string
  department: string | null
  role: string | null
  location: string | null
  state: string | null
  country: string | null
  /** Who this employee reports to. The org chart, one edge at a time. */
  managerId: string | null
  /**
   * Derived from `managerId`, never authored: true exactly when at least one
   * ACTIVE employee reports to this one.
   */
  isManager: boolean
  status: EmployeeStatus
  /** The day employment ended. Set only when `status` is TERMINATED. */
  terminatedOn: IsoDate | null
  /** Whole days between `hireDate` and today. Derived on read, never stored. */
  tenureDays: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface EmployeeAttributeHistoryDTO {
  id: string
  employeeId: string
  attribute: TrackedEmployeeAttribute | string
  oldValue: string | null
  newValue: string | null
  effectiveFrom: IsoDate
  effectiveTo: IsoDate | null
  changedBy: string | null
  createdAt: IsoDateTime
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export interface GroupDTO {
  id: string
  organizationId: string
  name: string
  description: string | null
  /**
   * The day the group was deleted. Null on every group a read endpoint returns —
   * deleted groups are filtered out — so this is only ever set on the body
   * `DELETE /groups/:id` hands back, which is where the caller needs to see the
   * date the memberships were end-dated on.
   */
  deletedOn: IsoDate | null
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface GroupMemberDTO {
  id: string
  groupId: string
  employeeId: string
  employeeName: string
  employeeEmail: string
  effectiveFrom: IsoDate
  effectiveTo: IsoDate | null
  createdAt: IsoDateTime
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export interface PolicyCategoryDTO {
  id: string
  organizationId: string
  name: string
  key: string
  cardinality: Cardinality
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface PolicyDTO {
  id: string
  organizationId: string
  categoryId: string
  name: string
  description: string | null
  status: PolicyStatus
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export interface RuleDTO {
  id: string
  organizationId: string
  policyId: string
  /** Set only on MANUAL rules — the single employee the override targets. */
  employeeId: string | null
  name: string
  ruleType: RuleType
  priority: number
  conditions: RuleConditions
  enabled: boolean
  effectiveFrom: IsoDate
  effectiveTo: IsoDate | null
  /** Current version. Each edit writes a snapshot and bumps this. */
  version: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** An immutable snapshot of a rule, as it stood at one version. */
export interface RuleVersionDTO {
  id: string
  ruleId: string
  version: number
  policyId: string
  employeeId: string | null
  name: string
  ruleType: RuleType
  priority: number
  conditions: RuleConditions
  enabled: boolean
  effectiveFrom: IsoDate
  effectiveTo: IsoDate | null
  createdBy: string | null
  createdAt: IsoDateTime
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export interface AuditEventDTO {
  id: string
  organizationId: string
  /** Null for system-initiated changes, e.g. the reconciliation worker. */
  actorId: string | null
  action: string
  entityType: string
  entityId: string
  beforeState: unknown
  afterState: unknown
  metadata: unknown
  createdAt: IsoDateTime
}

// ---------------------------------------------------------------------------
// Assignments and explanations
// ---------------------------------------------------------------------------

export interface AssignmentDTO {
  id: string
  organizationId: string
  employeeId: string
  policyId: string
  policyName: string
  categoryId: string
  categoryKey: string
  categoryName: string
  cardinality: Cardinality
  sourceRuleId: string
  sourceRuleVersion: number
  sourceRuleName: string
  effectiveFrom: IsoDate
  effectiveTo: IsoDate | null
  resolutionStatus: ResolutionStatus
  resolutionReason: string
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/**
 * One rule the engine considered, and what became of it.
 *
 * The losers are the point: a trail that only carried the winner could not
 * answer "why did the other rule not apply?".
 */
export interface ResolutionTrailEntryDTO {
  ruleId: string
  ruleVersion: number
  ruleName: string
  ruleType: RuleType
  priority: number
  policyId: string
  categoryId: string
  decision: ResolutionDecision
  reason: string
  /** The clauses that held. Empty for a DEFAULT or MANUAL rule. */
  matchedClauses: ConditionClause[]
  /** The first clause that did not hold, when `decision` is NOT_MATCHED. */
  failedClause: ConditionClause | null
}

/** What the engine decided for one policy category. */
export interface CategoryResolutionDTO {
  categoryId: string
  categoryKey: string
  categoryName: string
  cardinality: Cardinality
  /** One entry for SINGLE, zero or more for MULTIPLE. */
  winners: ResolvedPolicyDTO[]
  trail: ResolutionTrailEntryDTO[]
}

/** A policy the engine says should apply, before it is materialized. */
export interface ResolvedPolicyDTO {
  policyId: string
  policyName: string
  categoryId: string
  categoryKey: string
  cardinality: Cardinality
  ruleId: string
  ruleVersion: number
  ruleName: string
  ruleType: RuleType
  priority: number
  resolutionStatus: ResolutionStatus
  reason: string
}

/** The whole picture for one employee on one day. */
export interface ResolutionDTO {
  employeeId: string
  asOf: IsoDate
  categories: CategoryResolutionDTO[]
}

/** "Why does this assignment exist?" */
export interface AssignmentExplanationDTO {
  assignment: AssignmentDTO
  /** The rule text as it stood when the assignment was made. */
  sourceRuleVersion: RuleVersionDTO
  /** Every rule considered in the evaluation that produced this assignment. */
  trail: ResolutionTrailEntryDTO[]
}

/** The result of materializing a resolution: what actually changed. */
export interface ReconciliationResultDTO {
  employeeId: string
  asOf: IsoDate
  added: AssignmentDTO[]
  removed: AssignmentDTO[]
  unchanged: AssignmentDTO[]
}

/** A hypothetical change, run through the engine, writing nothing. */
export interface PreviewDTO {
  employeeId: string
  asOf: IsoDate
  added: ResolvedPolicyDTO[]
  removed: ResolvedPolicyDTO[]
  unchanged: ResolvedPolicyDTO[]
  resolution: ResolutionDTO
}

/** An employee a rule would match, with the clauses that made it match. */
export interface MatchingEmployeeDTO {
  employeeId: string
  name: string
  email: string
  matched: boolean
  reason: string
  matchedClauses: ConditionClause[]
  failedClause: ConditionClause | null
}
