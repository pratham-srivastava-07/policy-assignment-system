/**
 * Narrowing a rule's conditions into a candidate filter.
 *
 * When a rule changes, the worker has to answer "which employees does this
 * affect?" without evaluating every employee in the organization —
 * `docs/architecture.md` §12 is explicit that reconciliation should narrow the
 * population rather than sweep it.
 *
 * The conditions grammar is a flat AND list, which is exactly what makes this
 * tractable: every clause must hold, so any clause that maps onto an indexed
 * column can be pushed into the query, and the rest are evaluated in memory
 * against the far smaller set that comes back. Pushing down an AND can only ever
 * shrink the candidate set, never drop a true match.
 *
 * This module is pure. It emits a neutral filter description — no Prisma, no SQL
 * — and the employee repository is what turns it into a query.
 */

import {
  ConditionClause,
  RuleConditionsV1,
  daysBetween,
} from "@policy/shared"

/**
 * A database-neutral description of "which employees could match".
 *
 * Every field is optional and every present field is an AND. `hireDateFrom` /
 * `hireDateTo` are an inclusive window, derived from tenure clauses.
 */
export interface CandidateFilter {
  department?: string[]
  state?: string[]
  country?: string[]
  location?: string[]
  employmentType?: string[]
  role?: string[]
  isManager?: boolean
  /** Employees hired on or after this date — an upper bound on tenure. */
  hireDateFrom?: Date
  /** Employees hired on or before this date — a lower bound on tenure. */
  hireDateTo?: Date
  /** Restricts to members of these groups. Requires a membership join. */
  groupIds?: string[]
}

export interface NarrowedConditions {
  filter: CandidateFilter
  /**
   * Clauses the filter could not express, which must still be evaluated in
   * memory against whatever the query returns.
   */
  residual: ConditionClause[]
  /**
   * True when every clause was pushed into the filter, so anything the query
   * returns is guaranteed to match and no in-memory pass is needed.
   *
   * Callers may still evaluate — it is never wrong to — but this says when they
   * can skip it.
   */
  exhaustive: boolean
}

/** Attributes that map directly onto an indexed string column. */
const STRING_COLUMNS = {
  department: "department",
  state: "state",
  country: "country",
  location: "location",
  employmentType: "employmentType",
  role: "role",
} as const

type StringColumn = keyof typeof STRING_COLUMNS

const isStringColumn = (attribute: string): attribute is StringColumn => {

  return attribute in STRING_COLUMNS
}

/** Narrows `value` to a list of strings, or null if it is not one. */
const asStringList = (value: unknown): string[] | null => {

  if (typeof value === "string") {

    return [value]
  }

  if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {

    return value as string[]
  }

  return null
}

/**
 * Intersects two candidate lists.
 *
 * Two clauses on the same column are ANDed, so `department in [A, B]` alongside
 * `department eq A` leaves only A. Without this, the second clause would
 * silently replace the first and widen the set.
 */
const intersect = (existing: string[] | undefined, incoming: string[]): string[] => {

  if (!existing) {

    return incoming
  }

  return existing.filter((entry) => incoming.includes(entry))
}

/**
 * Converts a tenure-in-days bound into a hire-date bound.
 *
 * Tenure is never stored — it is `asOf - hireDate` — so a clause about tenure is
 * really a clause about hire date, inverted: MORE tenure means an EARLIER hire
 * date. Getting that inversion backwards would silently select the complement of
 * the intended population, which is why it is spelled out here rather than
 * inlined.
 */
const hireDateForTenure = (asOf: Date, tenureDays: number): Date => {

  const bound = new Date(asOf)

  bound.setUTCDate(bound.getUTCDate() - tenureDays)

  return bound
}

/**
 * Splits conditions into "what the database can filter" and "what is left".
 *
 * Only operators whose meaning survives translation are pushed down. Anything
 * else — a negation, an unrecognised attribute, a malformed value — falls to the
 * residual list, which is always safe: a wider query plus an in-memory check
 * gives the same answer, just less cheaply.
 */
export const narrowConditions = (
  conditions: RuleConditionsV1,
  asOf: Date,
): NarrowedConditions => {

  const filter: CandidateFilter = {}
  const residual: ConditionClause[] = []

  for (const clause of conditions.all) {

    const { attribute, op, value } = clause

    if (isStringColumn(attribute)) {

      const values = op === "eq" || op === "in" ? asStringList(value) : null

      if (values && values.length > 0) {

        filter[attribute] = intersect(filter[attribute], values)

        continue
      }

      // neq / notIn cannot be pushed down as a positive filter, and an empty
      // "in" is a contradiction the engine should report rather than the query.
      residual.push(clause)

      continue
    }

    if (attribute === "isManager" && op === "eq" && typeof value === "boolean") {

      filter.isManager = value

      continue
    }

    if (attribute === "groupId" && (op === "eq" || op === "in")) {

      const values = asStringList(value)

      if (values && values.length > 0) {

        filter.groupIds = intersect(filter.groupIds, values)

        continue
      }

      residual.push(clause)

      continue
    }

    if (attribute === "tenureDays" && typeof value === "number") {

      // tenure >= N  ->  hired on or before (asOf - N): at least N days ago.
      if (op === "gte" || op === "gt") {

        const days = op === "gt" ? value + 1 : value
        const bound = hireDateForTenure(asOf, days)

        filter.hireDateTo =
          filter.hireDateTo && filter.hireDateTo < bound ? filter.hireDateTo : bound

        continue
      }

      // tenure <= N  ->  hired on or after (asOf - N): at most N days ago.
      if (op === "lte" || op === "lt") {

        const days = op === "lt" ? value - 1 : value
        const bound = hireDateForTenure(asOf, days)

        filter.hireDateFrom =
          filter.hireDateFrom && filter.hireDateFrom > bound ? filter.hireDateFrom : bound

        continue
      }

      residual.push(clause)

      continue
    }

    residual.push(clause)
  }

  return {
    filter,
    residual,
    exhaustive: residual.length === 0,
  }
}

/**
 * Whether a filter would select the whole organization.
 *
 * A rule with no narrowable conditions — a DEFAULT catch-all, say — genuinely
 * does affect everyone, and the caller needs to know that it is about to load
 * the full population rather than discovering it by surprise.
 */
export const isUnnarrowed = (filter: CandidateFilter): boolean => {

  return Object.keys(filter).length === 0
}

/** Re-exported so callers computing tenure agree with the engine. */
export { daysBetween }
