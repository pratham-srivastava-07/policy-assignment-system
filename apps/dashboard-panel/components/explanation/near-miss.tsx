"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, X } from "lucide-react"
import type { ResolutionTrailEntryDTO } from "@policy/shared"
import { ConditionSentence, type GroupNameLookup } from "@/components/conditions"
import { SHORT_CIRCUIT_NOTE } from "@/components/policy"

/**
 * Nearly matched (design.md §15).
 *
 * Not a new feature: it surfaces `NOT_MATCHED` entries that the trail already
 * carries, at no extra request and no EXPENSIVE call.
 *
 * The wording is constrained. "One condition away" is forbidden, because the
 * evaluator short-circuits and the data cannot tell a rule that failed its first
 * condition from one that failed its fifth. "Did not match" plus the note below
 * is the strongest claim the backend supports (§15.2).
 */
export const NearMiss = ({
  entries,
  subject,
  policyNameOf,
  groupName,
}: {
  entries: ResolutionTrailEntryDTO[]
  subject: string
  policyNameOf: (policyId: string) => string
  groupName?: GroupNameLookup
}) => {
  const [open, setOpen] = useState(false)

  // §15.4: a SKIPPED_* rule is an administrative state, not a near miss.
  const misses = entries.filter(
    (entry) => entry.decision === "NOT_MATCHED" && entry.failedClause !== null,
  )

  if (misses.length === 0) return null

  return (
    <section className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface"
      >
        {open ? (
          <ChevronDown className="size-4 text-ink-subtle" aria-hidden />
        ) : (
          <ChevronRight className="size-4 text-ink-subtle" aria-hidden />
        )}
        <span className="text-sm font-medium text-ink">Nearly matched</span>
        <span className="tabular text-xs text-ink-subtle">({misses.length})</span>
        <span className="ml-auto text-xs text-ink-subtle">
          Rules that were evaluated and did not apply
        </span>
      </button>

      {open ? (
        <div className="flex flex-col divide-y divide-border border-t border-border">
          {misses.map((entry) => (
            <div
              key={`${entry.ruleId}-${entry.ruleVersion}`}
              className="flex flex-col gap-2 px-3 py-3"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium text-ink">
                  {policyNameOf(entry.policyId)}
                </span>
                <span className="text-xs text-ink-muted">via {entry.ruleName}</span>
                <span className="tabular ml-auto text-xs text-ink-subtle">
                  {entry.ruleType} &middot; priority {entry.priority}
                </span>
              </div>

              <div className="flex items-start gap-2">
                <X className="mt-0.5 size-3.5 shrink-0 text-status-danger" aria-hidden />
                <span className="sr-only">Did not match:</span>
                <ConditionSentence
                  clause={entry.failedClause!}
                  attributeValues={entry.attributeValues}
                  subject={subject}
                  tone="failed"
                  groupName={groupName}
                />
              </div>

              <p className="pl-5 text-xs text-ink-subtle">{SHORT_CIRCUIT_NOTE}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
