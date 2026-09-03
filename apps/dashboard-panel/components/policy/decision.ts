import type { Cardinality, ResolutionDecision } from "@policy/shared"

/**
 * design.md §14.4. Six decisions, and the labels an admin reads.
 *
 * `MATCHED_LOST` branches on cardinality, and the branch is not cosmetic: in a
 * MULTIPLE category "lost to a higher-priority rule" is simply false, because
 * rules there do not compete for the category, only for the same policy. §27.4
 * forbids implying a single winner in a MULTIPLE category.
 */

export type DecisionTone = "success" | "warning" | "neutral"

export interface DecisionPresentation {
  label: string
  tone: DecisionTone
  /** The fallback body, used when the engine's own `reason` is not preferred. */
  body: string
}

export const presentDecision = (
  decision: ResolutionDecision,
  cardinality: Cardinality,
): DecisionPresentation => {
  switch (decision) {
    case "MATCHED_WON":
      return { label: "Won", tone: "success", body: "This rule produced the assignment." }

    case "MATCHED_LOST":
      return cardinality === "SINGLE"
        ? {
            label: "Lost",
            tone: "warning",
            body: "Matched, but a higher-priority rule won this category.",
          }
        : {
            label: "Not applied",
            tone: "warning",
            body: "Matched, but this policy was already assigned by a higher-ordered rule.",
          }

    case "NOT_MATCHED":
      return {
        label: "No match",
        tone: "neutral",
        body: "The employee did not satisfy this rule's conditions.",
      }

    case "SKIPPED_DISABLED":
      return { label: "Skipped", tone: "neutral", body: "The rule is disabled." }

    case "SKIPPED_OUT_OF_WINDOW":
      return {
        label: "Skipped",
        tone: "neutral",
        body: "Outside its effective dates on this day.",
      }

    case "SKIPPED_POLICY_INACTIVE":
      return { label: "Skipped", tone: "neutral", body: "Its policy is draft or archived." }
  }
}

export const isSkipped = (decision: ResolutionDecision): boolean =>
  decision.startsWith("SKIPPED_")

/**
 * The short-circuit note (§3.2a, §15.2).
 *
 * `evaluateConditions` stops at the first clause that fails, so a rule failing
 * clause 1 of 5 and one failing clause 5 of 5 look identical in the trail. Any
 * wording stronger than this is a claim the backend cannot support, which is why
 * "one condition away" appears nowhere in this application.
 */
export const SHORT_CIRCUIT_NOTE =
  "Evaluation stops at the first condition that fails. Later conditions were not tested."
