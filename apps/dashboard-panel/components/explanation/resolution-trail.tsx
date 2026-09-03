"use client"

import { Check, Minus, X } from "lucide-react"
import type {
  Cardinality,
  ResolutionTrailEntryDTO,
  RuleType,
} from "@policy/shared"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui"
import { ConditionSentence, type GroupNameLookup } from "@/components/conditions"
import { SHORT_CIRCUIT_NOTE, presentDecision, type DecisionTone } from "@/components/policy"

/**
 * The resolution trail: every rule the engine considered, and what became of it.
 *
 * The losers are the point. A panel that showed only the winner could not answer
 * "why did the other rule not apply?", which is the question this product
 * exists to answer (design.md §50).
 *
 * This is the application's signature surface, so its structure encodes the
 * decision rather than decorating it: a coloured rail per entry, the decision as
 * a labelled badge, the clauses as sentences, and the employee's own value from
 * the evaluation record beside each one.
 */

const TONE_BADGE: Record<DecisionTone, "success" | "warning" | "neutral"> = {
  success: "success",
  warning: "warning",
  neutral: "neutral",
}

const TONE_RAIL: Record<DecisionTone, string> = {
  success: "bg-status-success",
  warning: "bg-status-warning",
  neutral: "bg-border",
}

export const TrailEntry = ({
  entry,
  cardinality,
  subject,
  groupName,
}: {
  entry: ResolutionTrailEntryDTO
  cardinality: Cardinality
  subject: string
  groupName?: GroupNameLookup
}) => {
  const presentation = presentDecision(entry.decision, cardinality)

  // §14.7: decisions recorded before the clause migration carry no clause detail.
  // The fallback is the engine's own `reason`, which every row has always had.
  const hasClauseDetail =
    entry.matchedClauses.length > 0 || entry.failedClause !== null

  return (
    <li className="flex gap-3 py-3">
      <span
        aria-hidden
        className={cn("mt-1 w-0.5 shrink-0 rounded-full", TONE_RAIL[presentation.tone])}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Badge tone={TONE_BADGE[presentation.tone]}>{presentation.label}</Badge>
          <span className="min-w-0 truncate text-sm font-medium text-ink">
            {entry.ruleName}
          </span>
          <span className="tabular ml-auto text-xs text-ink-subtle">
            {entry.ruleType as RuleType} &middot; priority {entry.priority}
            <span className="text-ink-subtle"> &middot; v{entry.ruleVersion}</span>
          </span>
        </div>

        {hasClauseDetail ? (
          <div className="flex flex-col gap-1.5">
            {entry.matchedClauses.map((clause, index) => (
              <div key={`matched-${index}`} className="flex items-start gap-2">
                <Check
                  className="mt-0.5 size-3.5 shrink-0 text-status-success"
                  aria-hidden
                />
                <span className="sr-only">Matched:</span>
                <ConditionSentence
                  clause={clause}
                  attributeValues={entry.attributeValues}
                  subject={subject}
                  tone="matched"
                  groupName={groupName}
                />
              </div>
            ))}

            {entry.failedClause ? (
              <div className="flex items-start gap-2">
                <X className="mt-0.5 size-3.5 shrink-0 text-status-danger" aria-hidden />
                <span className="sr-only">Did not match:</span>
                <ConditionSentence
                  clause={entry.failedClause}
                  attributeValues={entry.attributeValues}
                  subject={subject}
                  tone="failed"
                  groupName={groupName}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{entry.reason}</p>
        )}

        {entry.decision === "NOT_MATCHED" && entry.failedClause ? (
          <p className="text-xs text-ink-subtle">{SHORT_CIRCUIT_NOTE}</p>
        ) : null}

        {hasClauseDetail && entry.decision !== "NOT_MATCHED" ? (
          <p className="text-xs text-ink-subtle">{entry.reason}</p>
        ) : null}

        {!hasClauseDetail && entry.decision === "MATCHED_WON" ? (
          <p className="text-xs text-ink-subtle">
            Condition detail was not recorded for this evaluation. Reconcile {subject} to
            capture it.
          </p>
        ) : null}
      </div>
    </li>
  )
}

export const ResolutionTrail = ({
  entries,
  cardinality,
  subject,
  groupName,
  className,
}: {
  entries: ResolutionTrailEntryDTO[]
  cardinality: Cardinality
  subject: string
  groupName?: GroupNameLookup
  className?: string
}) => (
  <ul className={cn("flex flex-col divide-y divide-border", className)}>
    {entries.map((entry) => (
      <TrailEntry
        key={`${entry.ruleId}-${entry.ruleVersion}-${entry.decision}`}
        entry={entry}
        cardinality={cardinality}
        subject={subject}
        groupName={groupName}
      />
    ))}
    {entries.length === 0 ? (
      <li className="flex items-center gap-2 py-3 text-sm text-ink-muted">
        <Minus className="size-4 text-ink-subtle" aria-hidden />
        No rules were considered for this category in that evaluation.
      </li>
    ) : null}
  </ul>
)
