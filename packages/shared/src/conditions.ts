/**
 * The rule condition grammar.
 *
 * A rule's `conditions` column holds a versioned, flat, AND-only envelope:
 *
 *     {
 *       "version": 1,
 *       "all": [
 *         { "attribute": "department", "op": "eq", "value": "Engineering" },
 *         { "attribute": "tenureDays", "op": "gte", "value": 730 }
 *       ]
 *     }
 *
 * Every clause in `all` is ANDed. There is no `any` / `not` / nesting today.
 *
 * The `version` discriminator is the whole point of the envelope: a nested
 * boolean tree can be introduced later as version 2 without a migration, because
 * old rows keep declaring `version: 1` and the evaluator can branch on it.
 */

/**
 * The attributes a rule may match on.
 *
 * Each of these resolves against an employee at a point in time:
 *
 *   department, state, country, location, employmentType, role
 *     - columns on `employees`, historically reconstructible from
 *       `employee_attribute_history`
 *   tenureDays
 *     - DERIVED: whole days between `employees.hire_date` and the as-of date.
 *       Never a stored column.
 *   isManager
 *     - managerial status
 *   groupId
 *     - membership in `employee_groups`, effective-dated
 */
export const CONDITION_ATTRIBUTES = [
  "department",
  "state",
  "country",
  "location",
  "employmentType",
  "role",
  "tenureDays",
  "isManager",
  "groupId",
] as const

export type ConditionAttribute = (typeof CONDITION_ATTRIBUTES)[number]

/**
 * Comparison operators.
 *
 *   eq / neq       - equality against a scalar
 *   in / notIn     - membership in a list
 *   gte / lte / gt / lt - ordered comparison (numeric attributes such as
 *                    `tenureDays`; the evaluator rejects them elsewhere)
 */
export const CONDITION_OPERATORS = [
  "eq",
  "neq",
  "in",
  "notIn",
  "gte",
  "lte",
  "gt",
  "lt",
] as const

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]

/** Operators whose `value` is a list rather than a scalar. */
export const LIST_OPERATORS: readonly ConditionOperator[] = ["in", "notIn"]

/** Operators that require an ordered (numeric) attribute. */
export const ORDERED_OPERATORS: readonly ConditionOperator[] = [
  "gte",
  "lte",
  "gt",
  "lt",
]

/** Attributes whose values are numbers rather than strings or booleans. */
export const NUMERIC_ATTRIBUTES: readonly ConditionAttribute[] = ["tenureDays"]

/** Attributes whose values are booleans. */
export const BOOLEAN_ATTRIBUTES: readonly ConditionAttribute[] = ["isManager"]

export type ConditionScalar = string | number | boolean

export type ConditionValue = ConditionScalar | ConditionScalar[]

/**
 * The employee's own value for each attribute a rule referenced, captured at
 * evaluation time. Recorded alongside the decision so an explanation can say
 * "state = CA (Alice: NY)" for the day it was decided, not for today.
 */
export type AttributeValues = Partial<Record<ConditionAttribute, ConditionScalar | string[] | null>>

/** One requirement inside a rule. */
export interface ConditionClause {
  attribute: ConditionAttribute
  op: ConditionOperator
  value: ConditionValue
}

/** The current envelope version. Bump only when the grammar itself changes. */
export const RULE_CONDITIONS_VERSION = 1 as const

/**
 * The stored shape of `policy_rules.conditions`.
 *
 * Declared as an interface with a literal `version` so that a future
 * `RuleConditionsV2` can join it in a discriminated union without breaking
 * existing readers.
 */
export interface RuleConditionsV1 {
  version: typeof RULE_CONDITIONS_VERSION
  all: ConditionClause[]
}

export type RuleConditions = RuleConditionsV1

/**
 * The envelope a MANUAL rule carries: it targets an employee by id, not by
 * matching attributes, so it has no clauses.
 */
export const EMPTY_RULE_CONDITIONS: RuleConditions = {
  version: RULE_CONDITIONS_VERSION,
  all: [],
}

/**
 * The point-in-time snapshot of an employee that the evaluator compares clauses
 * against. Assembled by the assignment engine (not built yet); declared here so
 * the grammar and the thing it is evaluated against stay in one vocabulary.
 */
export interface EmployeeContext {
  employeeId: string
  department: string | null
  state: string | null
  country: string | null
  location: string | null
  employmentType: string
  role: string | null
  /** Whole days between hire date and the as-of date. Derived, never stored. */
  tenureDays: number
  isManager: boolean
  /** Ids of every group the employee belonged to on the as-of date. */
  groupIds: string[]
}
