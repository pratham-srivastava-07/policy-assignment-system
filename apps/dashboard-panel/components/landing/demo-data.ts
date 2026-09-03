import type { ConditionClause } from "@policy/shared"

/**
 * The landing page demo.
 *
 * A miniature of the real engine, not a picture of one. The clause shape is
 * `@policy/shared`'s own `ConditionClause`, the conditions are rendered by the
 * same `formatClause` the rule editor uses, and the resolution below follows the
 * production ordering: priority descending, then rule type, then creation order.
 *
 * It runs entirely in the browser against six fixed rules. Nothing here talks to
 * the API, and nothing here is a claim about a real customer.
 */

export type DemoCardinality = "SINGLE" | "MULTIPLE"

export interface DemoRule {
  id: string
  name: string
  priority: number
  category: string
  cardinality: DemoCardinality
  policy: string
  clauses: ConditionClause[]
}

export interface DemoEmployee {
  name: string
  title: string
  department: string
  state: string
  employmentType: string
  tenureDays: number
}

export const DEMO_EMPLOYEE: DemoEmployee = {
  name: "Priya Raghunathan",
  title: "Staff Engineer",
  department: "Engineering",
  state: "CA",
  employmentType: "FULL_TIME",
  tenureDays: 1245,
}

export const DEMO_RULES: DemoRule[] = [
  {
    id: "vacation-default",
    name: "Standard vacation",
    priority: 100,
    category: "Vacation",
    cardinality: "SINGLE",
    policy: "Standard Vacation",
    clauses: [],
  },
  {
    id: "vacation-engineering",
    name: "Engineering vacation",
    priority: 500,
    category: "Vacation",
    cardinality: "SINGLE",
    policy: "Engineering Vacation",
    clauses: [{ attribute: "department", op: "eq", value: "Engineering" }],
  },
  {
    id: "compliance-security",
    name: "Security training",
    priority: 100,
    category: "Compliance",
    cardinality: "MULTIPLE",
    policy: "Security Training",
    clauses: [],
  },
  {
    id: "compliance-ca",
    name: "California meal break",
    priority: 400,
    category: "Compliance",
    cardinality: "MULTIPLE",
    policy: "CA Meal Break Training",
    clauses: [{ attribute: "state", op: "eq", value: "CA" }],
  },
  {
    id: "stipend-engineering",
    name: "Engineering equipment",
    priority: 300,
    category: "Stipends",
    cardinality: "MULTIPLE",
    policy: "Monitor and Keyboard Stipend",
    clauses: [{ attribute: "department", op: "eq", value: "Engineering" }],
  },
  {
    id: "stipend-sales",
    name: "Sales commission",
    priority: 300,
    category: "Stipends",
    cardinality: "MULTIPLE",
    policy: "Sales Commission Plan",
    clauses: [{ attribute: "department", op: "eq", value: "Sales" }],
  },
]

export type DemoDecision = "WON" | "LOST" | "NO_MATCH"

export interface DemoOutcome {
  rule: DemoRule
  decision: DemoDecision
  /** The clause that stopped the match. Null when the rule matched. */
  failed: ConditionClause | null
}

const valueOf = (employee: DemoEmployee, attribute: ConditionClause["attribute"]) => {
  switch (attribute) {
    case "department":
      return employee.department
    case "state":
      return employee.state
    case "employmentType":
      return employee.employmentType
    case "tenureDays":
      return employee.tenureDays
    default:
      return null
  }
}

const holds = (employee: DemoEmployee, clause: ConditionClause): boolean => {
  const actual = valueOf(employee, clause.attribute)

  switch (clause.op) {
    case "eq":
      return actual === clause.value
    case "neq":
      return actual !== clause.value
    case "in":
      return Array.isArray(clause.value) && clause.value.includes(actual as never)
    case "notIn":
      return Array.isArray(clause.value) && !clause.value.includes(actual as never)
    case "gte":
      return Number(actual) >= Number(clause.value)
    case "lte":
      return Number(actual) <= Number(clause.value)
    case "gt":
      return Number(actual) > Number(clause.value)
    case "lt":
      return Number(actual) < Number(clause.value)
  }
}

/**
 * Priority descending, then declaration order. In a SINGLE category exactly one
 * matching rule wins and the rest are recorded as MATCHED_LOST; in a MULTIPLE
 * category every matching rule contributes its own policy.
 */
export const resolve = (employee: DemoEmployee): DemoOutcome[] => {
  const ordered = [...DEMO_RULES].sort(
    (a, b) =>
      b.priority - a.priority ||
      DEMO_RULES.indexOf(a) - DEMO_RULES.indexOf(b),
  )

  const claimed = new Set<string>()
  const decided = new Map<string, DemoOutcome>()

  for (const rule of ordered) {
    const failed = rule.clauses.find((clause) => !holds(employee, clause)) ?? null

    if (failed !== null) {
      decided.set(rule.id, { rule, decision: "NO_MATCH", failed })
      continue
    }

    const contested = rule.cardinality === "SINGLE" ? rule.category : rule.policy
    const taken = claimed.has(contested)

    claimed.add(contested)
    decided.set(rule.id, { rule, decision: taken ? "LOST" : "WON", failed: null })
  }

  return DEMO_RULES.map((rule) => decided.get(rule.id)!)
}

export const winningPolicies = (outcomes: DemoOutcome[]) =>
  outcomes.filter((outcome) => outcome.decision === "WON")
