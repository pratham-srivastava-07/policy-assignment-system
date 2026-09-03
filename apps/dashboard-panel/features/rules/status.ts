import { RULE_TYPE_PRIORITY_BANDS, type RuleDTO } from "@policy/shared"

/**
 * design.md §17.2 and §39. Rule status is derived in the browser, because
 * `RuleDTO` carries the three fields it is computed from and the API exposes no
 * status column to filter on.
 *
 * `effectiveTo` is EXCLUSIVE: a rule ending 2026-09-02 is not in effect on
 * September 2.
 */

export type RuleStatus = "Active" | "Scheduled" | "Expired" | "Inactive"

export const ruleStatus = (rule: RuleDTO, asOf: string): RuleStatus => {
  if (!rule.enabled) return "Inactive"
  if (rule.effectiveFrom > asOf) return "Scheduled"
  if (rule.effectiveTo !== null && rule.effectiveTo <= asOf) return "Expired"

  return "Active"
}

export const RULE_STATUS_TONE: Record<RuleStatus, "success" | "warning" | "neutral"> = {
  Active: "success",
  Scheduled: "warning",
  Expired: "neutral",
  Inactive: "neutral",
}

/**
 * The engine's own comparator (§17.4).
 *
 * This is a DISPLAY SORT and never a decision. It is safe only because the
 * priority bands are imported from `@policy/shared` rather than re-typed, so the
 * ordering shown here cannot drift from the ordering the engine applies.
 *
 * Only ever computed within one policy's rule list. Across a category it would
 * need every policy in the category and every rule under each, which is not one
 * request and would therefore be a guess.
 */
export const compareRules = (a: RuleDTO, b: RuleDTO): number =>
  b.priority - a.priority ||
  RULE_TYPE_PRIORITY_BANDS[b.ruleType] - RULE_TYPE_PRIORITY_BANDS[a.ruleType] ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.id.localeCompare(b.id)

export const ordinal = (index: number): string => {
  const position = index + 1
  const suffix =
    position % 100 >= 11 && position % 100 <= 13
      ? "th"
      : position % 10 === 1
        ? "st"
        : position % 10 === 2
          ? "nd"
          : position % 10 === 3
            ? "rd"
            : "th"

  return `${position}${suffix}`
}
