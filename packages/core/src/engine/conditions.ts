import {
  ConditionClause,
  ConditionScalar,
  ConditionValue,
  EmployeeContext,
  NUMERIC_ATTRIBUTES,
  RuleConditions,
} from "@policy/shared"
import { ConditionEvaluation } from "./types"

/**
 * The condition evaluator.
 *
 * The grammar is flat and AND-only: every clause in `all` must hold. Evaluation
 * stops at the first clause that fails, and that clause is handed back — it is
 * the answer to "why did this rule not apply to this employee?", and an
 * explanation that only said "no match" would not be worth writing down.
 *
 * A rule with no clauses matches everyone. That is what DEFAULT rules are, and
 * MANUAL rules too — a MANUAL rule selects its employee by id, not by attribute,
 * so the empty envelope is correct rather than an oversight.
 */

/** Human-readable rendering of one value, for reason text. */
const renderValue = (value: ConditionValue): string => {

  if (Array.isArray(value)) {

    return value.map((item) => String(item)).join(", ")
  }

  return String(value)
}

/** Human-readable rendering of one clause, for reason text. */
export const renderClause = (clause: ConditionClause): string => {

  if (clause.op === "eq") {

    return `${clause.attribute}=${renderValue(clause.value)}`
  }

  return `${clause.attribute} ${clause.op} ${renderValue(clause.value)}`
}

/** Human-readable rendering of what the employee actually had. */
const renderActual = (actual: unknown): string => {

  if (actual === null || actual === undefined) {

    return "(not set)"
  }

  if (Array.isArray(actual)) {

    return actual.length === 0 ? "(none)" : actual.join(", ")
  }

  return String(actual)
}

/** The employee-side value for one condition attribute. */
const readAttribute = (
  clause: ConditionClause,
  context: EmployeeContext,
): ConditionScalar | string[] | null => {

  switch (clause.attribute) {

    case "department":
      return context.department

    case "state":
      return context.state

    case "country":
      return context.country

    case "location":
      return context.location

    case "employmentType":
      return context.employmentType

    case "role":
      return context.role

    case "tenureDays":
      return context.tenureDays

    case "isManager":
      return context.isManager

    case "groupId":
      return context.groupIds

    default:
      return null
  }
}

/** The clause value as a list, whatever form it arrived in. */
const asList = (value: ConditionValue): ConditionScalar[] => {

  return Array.isArray(value) ? value : [value]
}

/**
 * Group membership is the one many-valued attribute, so it gets set semantics:
 * `eq` means "is in that group", `in` means "is in any of those groups".
 */
const matchesGroups = (clause: ConditionClause, groupIds: string[]): boolean => {

  const wanted = asList(clause.value).map((value) => String(value))

  switch (clause.op) {

    case "eq":
    case "in":
      return wanted.some((id) => groupIds.includes(id))

    case "neq":
    case "notIn":
      return !wanted.some((id) => groupIds.includes(id))

    default:
      // Ordered comparison on a group id is meaningless; the validator rejects
      // it at write time and the evaluator refuses it here as well.
      return false
  }
}

/** Ordered comparison. Only ever reached for a numeric attribute. */
const matchesOrdered = (clause: ConditionClause, actual: unknown): boolean => {

  if (typeof actual !== "number" || typeof clause.value !== "number") {

    return false
  }

  switch (clause.op) {

    case "gte":
      return actual >= clause.value

    case "lte":
      return actual <= clause.value

    case "gt":
      return actual > clause.value

    case "lt":
      return actual < clause.value

    default:
      return false
  }
}

/** Scalar equality and membership. */
const matchesScalar = (clause: ConditionClause, actual: ConditionScalar): boolean => {

  const isNumeric = NUMERIC_ATTRIBUTES.includes(clause.attribute)

  // Everything except the numeric attributes compares as text, so that a value
  // stored as a string and a value typed into a rule cannot disagree over their
  // representation.
  const normalize = (value: ConditionScalar): ConditionScalar => {

    return isNumeric ? value : String(value)
  }

  const left = normalize(actual)

  switch (clause.op) {

    case "eq":
      return !Array.isArray(clause.value) && left === normalize(clause.value)

    case "neq":
      return !Array.isArray(clause.value) && left !== normalize(clause.value)

    case "in":
      return asList(clause.value).some((value) => normalize(value) === left)

    case "notIn":
      return !asList(clause.value).some((value) => normalize(value) === left)

    default:
      return matchesOrdered(clause, actual)
  }
}

/** Does one clause hold for this employee? */
const matchesClause = (clause: ConditionClause, context: EmployeeContext): boolean => {

  const actual = readAttribute(clause, context)

  if (clause.attribute === "groupId") {

    return matchesGroups(clause, Array.isArray(actual) ? actual : [])
  }

  // DECISION: a NULL attribute matches NOTHING, not even `neq` / `notIn`. An
  // employee whose department has not been filled in is not "not in
  // Engineering" — the system does not know where they are, and quietly
  // assigning them the everyone-except-Engineering policy would be a guess.
  if (actual === null || actual === undefined) {

    return false
  }

  return matchesScalar(clause, actual as ConditionScalar)
}

/**
 * Evaluate a rule's conditions against an employee context.
 *
 * Pure: no dates are read, no clock is consulted, nothing is loaded. `context`
 * already carries the tenure and group membership that were true on the as-of
 * date.
 */
export const evaluateConditions = (
  conditions: RuleConditions,
  context: EmployeeContext,
): ConditionEvaluation => {

  const matchedClauses: ConditionClause[] = []

  for (const clause of conditions.all) {

    if (!matchesClause(clause, context)) {

      return {
        matched: false,
        matchedClauses,
        failedClause: clause,
      }
    }

    matchedClauses.push(clause)
  }

  return {
    matched: true,
    matchedClauses,
  }
}

/** The reason text for a clause that did not hold. */
export const explainFailure = (
  clause: ConditionClause,
  context: EmployeeContext,
): string => {

  const actual = readAttribute(clause, context)

  return `condition ${renderClause(clause)} did not match ${renderActual(actual)}`
}

/** The reason text for a set of clauses that all held. */
export const explainMatch = (clauses: ConditionClause[]): string => {

  if (clauses.length === 0) {

    return "rule has no conditions and applies to everyone in scope"
  }

  return `matched ${clauses.map(renderClause).join(" and ")}`
}
