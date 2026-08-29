import {
  EmployeeContext,
  RULE_TYPE_PRIORITY_BANDS,
  ResolutionStatus,
  isEffectiveOn,
  tenureDaysAsOf,
  toIsoDate,
} from "@policy/shared"
import { evaluateConditions, explainFailure, explainMatch } from "./conditions"
import {
  CategoryResolution,
  ConditionEvaluation,
  EngineEmployee,
  EngineRule,
  ResolutionResult,
  ResolveInput,
  ResolvedPolicy,
  RuleTrailEntry,
} from "./types"

/**
 * The resolution engine.
 *
 * Pure in, pure out. Rows are loaded by the caller, flattened into EngineRule,
 * and handed here; nothing in this file reads a database, a clock or a request.
 * Two runs over the same inputs produce identical output, which is what makes an
 * assignment explainable months later.
 *
 * The pipeline:
 *
 *     candidates -> gate (target employee, enabled, window, policy status)
 *                -> evaluate conditions
 *                -> sort into a TOTAL order
 *                -> collapse per category by cardinality
 *
 * Every rule that entered produces exactly one trail entry, whatever became of
 * it. The losers are not noise — they are the answer to "why did the other rule
 * not apply?".
 */

/**
 * The employee context the condition evaluator compares against.
 *
 * Exported because the population sweeps behind /rules/:id/matching-employees
 * and /rules/simulate evaluate conditions without resolving anything, and they
 * must derive tenure exactly the way a real resolution does.
 */
export const buildEmployeeContext = (
  employee: EngineEmployee,
  asOf: Date,
): EmployeeContext => {

  return {
    employeeId: employee.id,
    department: employee.department,
    state: employee.state,
    country: employee.country,
    location: employee.location,
    employmentType: employee.employmentType,
    role: employee.role,
    // Derived here, from the hire date and the as-of date. Never read from a
    // column, never taken from the caller.
    tenureDays: tenureDaysAsOf(employee.hireDate, asOf),
    isManager: employee.isManager,
    groupIds: employee.groupIds,
  }
}

/** The default priority band for a rule type — the sort's second key. */
const bandOf = (rule: EngineRule): number => {

  return RULE_TYPE_PRIORITY_BANDS[rule.ruleType]
}

/**
 * The deterministic total order:
 *
 *     priority DESC, rule type band DESC, created_at ASC, id ASC
 *
 * Priority is the sole authority — the band never re-enters the comparison once
 * two priorities differ. The last key is the rule's UUID, which is unique, so no
 * two rules can tie: the order is total, not merely partial, and the same rule
 * wins on every run.
 */
const compareRules = (left: EngineRule, right: EngineRule): number => {

  if (left.priority !== right.priority) {

    return right.priority - left.priority
  }

  if (bandOf(left) !== bandOf(right)) {

    return bandOf(right) - bandOf(left)
  }

  const leftCreated = left.createdAt.getTime()
  const rightCreated = right.createdAt.getTime()

  if (leftCreated !== rightCreated) {

    return leftCreated - rightCreated
  }

  if (left.id === right.id) {

    return 0
  }

  return left.id < right.id ? -1 : 1
}

/** Why the loser lost — naming the key that actually decided it. */
const explainLoss = (winner: EngineRule, loser: EngineRule): string => {

  if (winner.priority !== loser.priority) {

    return `priority ${winner.priority} beat ${loser.priority}: rule "${winner.name}" won`
  }

  if (bandOf(winner) !== bandOf(loser)) {

    return (
      `priority ${loser.priority} tied, so rule type decided: ` +
      `${winner.ruleType} (band ${bandOf(winner)}) beat ${loser.ruleType} (band ${bandOf(loser)})`
    )
  }

  if (winner.createdAt.getTime() !== loser.createdAt.getTime()) {

    return (
      `priority ${loser.priority} and rule type ${loser.ruleType} tied, so age decided: ` +
      `the older rule "${winner.name}" won`
    )
  }

  return (
    `priority ${loser.priority}, rule type ${loser.ruleType} and creation time all tied, ` +
    `so the rule id decided: ${winner.id} sorts before ${loser.id}`
  )
}

/** Why the winner won. */
const explainWin = (
  rule: EngineRule,
  evaluation: ConditionEvaluation,
  competitors: number,
): string => {

  const matched = explainMatch(evaluation.matchedClauses)

  if (rule.cardinality === "MULTIPLE") {

    return `${matched}; category "${rule.categoryKey}" allows multiple assignments`
  }

  if (competitors === 0) {

    return `${matched}; the only matching rule in category "${rule.categoryKey}"`
  }

  return (
    `${matched}; won on priority ${rule.priority} against ` +
    `${competitors} other matching rule${competitors === 1 ? "" : "s"}`
  )
}

const trailEntry = (
  rule: EngineRule,
  decision: RuleTrailEntry["decision"],
  reason: string,
  evaluation?: ConditionEvaluation,
): RuleTrailEntry => {

  return {
    ruleId: rule.id,
    ruleVersion: rule.version,
    ruleName: rule.name,
    ruleType: rule.ruleType,
    priority: rule.priority,
    policyId: rule.policyId,
    categoryId: rule.categoryId,
    decision,
    reason,
    matchedClauses: evaluation ? evaluation.matchedClauses : [],
    failedClause: evaluation?.failedClause ?? null,
  }
}

const resolutionStatusOf = (rule: EngineRule): ResolutionStatus => {

  return rule.ruleType === "MANUAL" ? "MANUAL_OVERRIDE" : "AUTOMATIC"
}

const toResolvedPolicy = (rule: EngineRule, reason: string): ResolvedPolicy => {

  return {
    policyId: rule.policyId,
    policyName: rule.policyName,
    categoryId: rule.categoryId,
    categoryKey: rule.categoryKey,
    categoryName: rule.categoryName,
    cardinality: rule.cardinality,
    ruleId: rule.id,
    ruleVersion: rule.version,
    ruleName: rule.name,
    ruleType: rule.ruleType,
    priority: rule.priority,
    resolutionStatus: resolutionStatusOf(rule),
    reason,
  }
}

/** A rule that passed every gate and matched, held with its evaluation. */
interface Candidate {
  rule: EngineRule
  evaluation: ConditionEvaluation
}

/** Everything the engine decided inside one category. */
interface CategoryBucket {
  categoryId: string
  categoryKey: string
  categoryName: string
  cardinality: CategoryResolution["cardinality"]
  candidates: Candidate[]
  trail: RuleTrailEntry[]
}

const bucketFor = (
  buckets: Map<string, CategoryBucket>,
  rule: EngineRule,
): CategoryBucket => {

  const existing = buckets.get(rule.categoryId)

  if (existing) {

    return existing
  }

  const created: CategoryBucket = {
    categoryId: rule.categoryId,
    categoryKey: rule.categoryKey,
    categoryName: rule.categoryName,
    cardinality: rule.cardinality,
    candidates: [],
    trail: [],
  }

  buckets.set(rule.categoryId, created)

  return created
}

/**
 * Resolve every policy that applies to one employee on one day.
 *
 * `rules` should be every rule in the organization that could conceivably apply,
 * including the disabled and out-of-window ones: the engine records why each was
 * skipped, and a caller that pre-filtered them would silently lose that half of
 * the explanation.
 */
export const resolve = (input: ResolveInput): ResolutionResult => {

  const { employee, rules, asOf } = input

  const context = buildEmployeeContext(employee, asOf)
  const buckets = new Map<string, CategoryBucket>()

  for (const rule of rules) {

    const bucket = bucketFor(buckets, rule)

    // A MANUAL rule names one employee. Reaching this with somebody else's
    // override means the caller over-fetched; it is recorded as a plain
    // non-match rather than trusted.
    if (rule.employeeId !== null && rule.employeeId !== employee.id) {

      bucket.trail.push(
        trailEntry(
          rule,
          "NOT_MATCHED",
          `manual override targets a different employee (${rule.employeeId})`,
        ),
      )

      continue
    }

    if (!rule.enabled) {

      bucket.trail.push(trailEntry(rule, "SKIPPED_DISABLED", "rule is disabled"))

      continue
    }

    const window = { effectiveFrom: rule.effectiveFrom, effectiveTo: rule.effectiveTo }

    if (!isEffectiveOn(window, asOf)) {

      const rendered = rule.effectiveTo
        ? `${toIsoDate(rule.effectiveFrom)} to ${toIsoDate(rule.effectiveTo)} (exclusive)`
        : `${toIsoDate(rule.effectiveFrom)} onwards`

      bucket.trail.push(
        trailEntry(
          rule,
          "SKIPPED_OUT_OF_WINDOW",
          `as of ${toIsoDate(asOf)} the rule is outside its effective window: ${rendered}`,
        ),
      )

      continue
    }

    // Only ACTIVE policies evaluate. A DRAFT policy is one an admin is still
    // writing and an ARCHIVED one is retired; either producing assignments would
    // be a surprise.
    if (rule.policyStatus !== "ACTIVE") {

      bucket.trail.push(
        trailEntry(
          rule,
          "SKIPPED_POLICY_INACTIVE",
          `policy "${rule.policyName}" is ${rule.policyStatus}, not ACTIVE`,
        ),
      )

      continue
    }

    const evaluation = evaluateConditions(rule.conditions, context)

    if (!evaluation.matched) {

      const failed = evaluation.failedClause

      bucket.trail.push(
        trailEntry(
          rule,
          "NOT_MATCHED",
          failed ? explainFailure(failed, context) : "conditions did not match",
          evaluation,
        ),
      )

      continue
    }

    bucket.candidates.push({ rule, evaluation })
  }

  const categories: CategoryResolution[] = []

  for (const bucket of buckets.values()) {

    const ordered = [...bucket.candidates].sort((left, right) =>
      compareRules(left.rule, right.rule),
    )

    const winners: ResolvedPolicy[] = []
    const decided: RuleTrailEntry[] = []

    if (bucket.cardinality === "SINGLE") {

      const [winner, ...losers] = ordered

      if (winner) {

        const reason = explainWin(winner.rule, winner.evaluation, losers.length)

        winners.push(toResolvedPolicy(winner.rule, reason))

        decided.push(trailEntry(winner.rule, "MATCHED_WON", reason, winner.evaluation))

        for (const loser of losers) {

          decided.push(
            trailEntry(
              loser.rule,
              "MATCHED_LOST",
              explainLoss(winner.rule, loser.rule),
              loser.evaluation,
            ),
          )
        }
      }
    } else {

      // MULTIPLE: every match is kept. Two rules producing the SAME policy still
      // collapse to one assignment — the higher-ordered rule owns it, because an
      // employee cannot hold the same policy twice and the explanation has to
      // name a single source rule.
      const claimed = new Map<string, EngineRule>()

      for (const candidate of ordered) {

        const owner = claimed.get(candidate.rule.policyId)

        if (owner) {

          decided.push(
            trailEntry(
              candidate.rule,
              "MATCHED_LOST",
              `policy "${candidate.rule.policyName}" is already assigned by a ` +
                `higher-ordered rule: ${explainLoss(owner, candidate.rule)}`,
              candidate.evaluation,
            ),
          )

          continue
        }

        claimed.set(candidate.rule.policyId, candidate.rule)

        const reason = explainWin(candidate.rule, candidate.evaluation, 0)

        winners.push(toResolvedPolicy(candidate.rule, reason))

        decided.push(trailEntry(candidate.rule, "MATCHED_WON", reason, candidate.evaluation))
      }
    }

    categories.push({
      categoryId: bucket.categoryId,
      categoryKey: bucket.categoryKey,
      categoryName: bucket.categoryName,
      cardinality: bucket.cardinality,
      winners,
      trail: [...decided, ...bucket.trail],
    })
  }

  // A stable category order keeps two runs' output identical down to the array
  // indexes, which is what lets a caller diff one result against another.
  categories.sort((left, right) => {

    if (left.categoryKey === right.categoryKey) {

      return left.categoryId < right.categoryId ? -1 : 1
    }

    return left.categoryKey < right.categoryKey ? -1 : 1
  })

  return {
    employeeId: employee.id,
    asOf,
    categories,
    winners: categories.flatMap((category) => category.winners),
    trail: categories.flatMap((category) => category.trail),
    tenureDays: context.tenureDays,
  }
}
