import {
  BOOLEAN_ATTRIBUTES,
  CONDITION_ATTRIBUTES,
  LIST_OPERATORS,
  NUMERIC_ATTRIBUTES,
  type ConditionAttribute,
  type ConditionOperator,
} from "@policy/shared"

/**
 * One vocabulary for rule conditions, shared by the builder, rule detail, the
 * explanation drawer and the near-miss card (design.md §37).
 *
 * Everything here is derived from `@policy/shared` rather than restated, so a
 * new attribute or operator on the engine is a compile error here, not a
 * silently missing option.
 */

export type AttributeKind = "text" | "numeric" | "boolean" | "group"

export const attributeKind = (attribute: ConditionAttribute): AttributeKind => {
  if (attribute === "groupId") return "group"
  if (NUMERIC_ATTRIBUTES.includes(attribute)) return "numeric"
  if (BOOLEAN_ATTRIBUTES.includes(attribute)) return "boolean"

  return "text"
}

export const ATTRIBUTE_LABELS: Record<ConditionAttribute, string> = {
  department: "Department",
  state: "State",
  country: "Country",
  location: "Location",
  employmentType: "Employment type",
  role: "Role",
  tenureDays: "Tenure",
  isManager: "Manager status",
  groupId: "Membership",
}

/**
 * design.md §18.3. The operator list is filtered by attribute kind so the form
 * never offers something the evaluator rejects: ordered comparison against a
 * group id or a string is a server-side 400, and offering it would teach the
 * user a rule that does not exist.
 */
const OPERATORS_BY_KIND: Record<AttributeKind, readonly ConditionOperator[]> = {
  text: ["eq", "neq", "in", "notIn"],
  numeric: ["gte", "lte", "gt", "lt", "eq", "neq"],
  boolean: ["eq"],
  group: ["eq", "in", "neq", "notIn"],
}

export const operatorsFor = (attribute: ConditionAttribute): readonly ConditionOperator[] =>
  OPERATORS_BY_KIND[attributeKind(attribute)]

/**
 * Operator wording, branched by kind.
 *
 * `eq` on a group is "is in group", not "equals" — the clause tests membership,
 * and "groupId equals <uuid>" is engine vocabulary leaking into an admin's
 * screen. §42 asks that every condition read as a sentence.
 */
const OPERATOR_LABELS: Record<AttributeKind, Partial<Record<ConditionOperator, string>>> = {
  text: { eq: "equals", neq: "does not equal", in: "is one of", notIn: "is not one of" },
  numeric: {
    gte: "at least",
    lte: "at most",
    gt: "greater than",
    lt: "less than",
    eq: "equals",
    neq: "does not equal",
  },
  boolean: { eq: "is" },
  // Reads as "Membership includes Beta Testers". Wording the group clause with
  // "group" in both halves produced "Group is in group Beta Testers".
  group: {
    eq: "includes",
    in: "includes any of",
    neq: "excludes",
    notIn: "excludes all of",
  },
}

export const operatorLabel = (
  attribute: ConditionAttribute,
  operator: ConditionOperator,
): string => OPERATOR_LABELS[attributeKind(attribute)][operator] ?? operator

export const isListOperator = (operator: ConditionOperator): boolean =>
  LIST_OPERATORS.includes(operator)

/** 365 days per year, both figures always shown (§15.3). */
export const DAYS_PER_YEAR = 365

export const yearsToDays = (years: number): number => Math.round(years * DAYS_PER_YEAR)

export const daysToYears = (days: number): number => days / DAYS_PER_YEAR

/**
 * `1,825 days (~5 years)`. Never a years figure alone, and never a countdown:
 * calendar-day arithmetic with leap years does not support that precision.
 */
export const formatTenureDays = (days: number): string => {
  const years = daysToYears(days)
  const rounded = Math.round(years * 10) / 10

  return `${days.toLocaleString()} days (~${rounded} ${rounded === 1 ? "year" : "years"})`
}

export const ATTRIBUTES = CONDITION_ATTRIBUTES

/** A clause the server rejects as a duplicate `(attribute, operator)` pair (§18.3). */
export const clauseKey = (attribute: ConditionAttribute, operator: ConditionOperator) =>
  `${attribute}:${operator}`
