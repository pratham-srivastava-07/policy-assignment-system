import {
  AttributeValues,
  Cardinality,
  ConditionClause,
  PolicyStatus,
  ResolutionDecision,
  ResolutionStatus,
  RuleConditions,
  RuleType,
} from "@policy/shared"

/**
 * The engine's vocabulary.
 *
 * Nothing in `src/engine` imports Prisma, Express or a repository. These are
 * plain data shapes: the caller loads rows, flattens them into these, and gets
 * plain data back. That is what makes the engine reproducible — the same inputs
 * always give the same answer, with no I/O in between to make it otherwise.
 */

/**
 * The employee as the engine sees them.
 *
 * `hireDate` rather than a tenure figure, deliberately: tenure is whole days
 * between the hire date and the as-of date, computed inside the engine at the
 * moment of evaluation. A stored tenure would be wrong the day after it was
 * written, and a caller-supplied one would make the engine's answer depend on
 * who called it.
 */
export interface EngineEmployee {
  id: string
  department: string | null
  state: string | null
  country: string | null
  location: string | null
  employmentType: string
  role: string | null
  isManager: boolean
  hireDate: Date
  /** The groups the employee belonged to on the as-of date. */
  groupIds: string[]
}

/**
 * One candidate rule, flattened together with the policy and category it
 * produces.
 *
 * The policy and category travel with the rule because cardinality is what
 * collapses the winners, and `policyStatus` is what makes a DRAFT policy a
 * recorded skip rather than an invisible one.
 */
export interface EngineRule {
  id: string
  /** The rule version this candidate represents; stamped onto the assignment. */
  version: number
  name: string
  ruleType: RuleType
  priority: number
  conditions: RuleConditions
  enabled: boolean
  effectiveFrom: Date
  effectiveTo: Date | null
  createdAt: Date
  /** Set only on MANUAL rules — the one employee the override targets. */
  employeeId: string | null
  policyId: string
  policyName: string
  policyStatus: PolicyStatus
  categoryId: string
  categoryKey: string
  categoryName: string
  cardinality: Cardinality
}

/** What `evaluateConditions` answers. */
export interface ConditionEvaluation {
  matched: boolean
  /** Every clause that held, in the order it was declared. */
  matchedClauses: ConditionClause[]
  /** The first clause that did not hold. Absent when `matched` is true. */
  failedClause?: ConditionClause
  attributeValues: AttributeValues
}

/** One rule the engine considered, and what became of it. */
export interface RuleTrailEntry {
  ruleId: string
  ruleVersion: number
  ruleName: string
  ruleType: RuleType
  priority: number
  policyId: string
  categoryId: string
  decision: ResolutionDecision
  reason: string
  matchedClauses: ConditionClause[]
  failedClause: ConditionClause | null
  attributeValues: AttributeValues
}

/** A policy the engine says should apply. */
export interface ResolvedPolicy {
  policyId: string
  policyName: string
  categoryId: string
  categoryKey: string
  categoryName: string
  cardinality: Cardinality
  ruleId: string
  ruleVersion: number
  ruleName: string
  ruleType: RuleType
  priority: number
  resolutionStatus: ResolutionStatus
  reason: string
}

/** The engine's answer for one policy category. */
export interface CategoryResolution {
  categoryId: string
  categoryKey: string
  categoryName: string
  cardinality: Cardinality
  /** Exactly one for SINGLE, zero or more for MULTIPLE. */
  winners: ResolvedPolicy[]
  /** Every rule in this category that was looked at, winners and losers alike. */
  trail: RuleTrailEntry[]
}

export interface ResolveInput {
  employee: EngineEmployee
  rules: EngineRule[]
  /** The calendar day being resolved. */
  asOf: Date
}

export interface ResolutionResult {
  employeeId: string
  asOf: Date
  categories: CategoryResolution[]
  /** Every winner across every category, flattened. */
  winners: ResolvedPolicy[]
  /** Every trail entry across every category, flattened. */
  trail: RuleTrailEntry[]
  /** Tenure the engine derived for this evaluation, in whole days. */
  tenureDays: number
}
