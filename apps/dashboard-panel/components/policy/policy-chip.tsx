"use client"

import { Flag, HelpCircle } from "lucide-react"
import type { Cardinality, IsoDate, ResolutionStatus } from "@policy/shared"
import { cn } from "@/lib/utils"
import { formatDay } from "@/lib/dates"

/**
 * The policy chip: one treatment for "a policy applies to this employee".
 *
 * Used on the employee Policies tab, in the rule editor's impact preview, in the
 * live reconciliation feed and inside diff rows, so the same fact never has two
 * appearances. The `Why?` affordance opens the explanation drawer in place; it
 * never navigates, because losing the page you were reading is the fastest way
 * to make an explanation useless (design.md §14.1).
 *
 * Colour carries state and nothing else. A chip is neutral by default; the only
 * coloured variants are a manual override and the added/removed tones a diff row
 * passes in. §42: the flag glyph is always accompanied by its text label.
 */

export type ChipTone = "neutral" | "added" | "removed"

export interface PolicyChipProps {
  policyName: string
  categoryName?: string
  cardinality?: Cardinality
  sourceRuleName?: string
  sourceRuleVersion?: number
  resolutionStatus?: ResolutionStatus
  effectiveFrom?: IsoDate
  effectiveTo?: IsoDate | null
  tone?: ChipTone
  /** Omitted when there is no assignment id to explain, e.g. a preview result. */
  onExplain?: () => void
  className?: string
}

const TONE_STYLES: Record<ChipTone, string> = {
  neutral: "border-border bg-bg",
  added: "border-status-success/35 bg-status-success-bg",
  removed: "border-status-danger/35 bg-status-danger-bg",
}

export const PolicyChip = ({
  policyName,
  categoryName,
  cardinality,
  sourceRuleName,
  sourceRuleVersion,
  resolutionStatus,
  effectiveFrom,
  effectiveTo,
  tone = "neutral",
  onExplain,
  className,
}: PolicyChipProps) => {
  const override = resolutionStatus === "MANUAL_OVERRIDE"

  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-md border px-2 py-1.5",
        TONE_STYLES[tone],
        className,
      )}
    >
      <span className="truncate text-sm font-medium text-ink">{policyName}</span>

      {categoryName ? (
        <span className="text-xs text-ink-subtle">
          {categoryName}
          {cardinality ? ` · ${cardinality}` : null}
        </span>
      ) : null}

      {override ? (
        <span className="inline-flex items-center gap-1 rounded-sm bg-status-info-bg px-1.5 text-xs font-medium text-status-info">
          <Flag className="size-3" aria-hidden />
          Manual override
        </span>
      ) : sourceRuleName ? (
        <span className="truncate text-xs text-ink-muted">
          via {sourceRuleName}
          {sourceRuleVersion !== undefined ? (
            <span className="tabular text-ink-subtle"> v{sourceRuleVersion}</span>
          ) : null}
        </span>
      ) : null}

      {effectiveFrom ? (
        <span className="tabular text-xs text-ink-subtle">
          {formatDay(effectiveFrom)}
          {effectiveTo ? ` to ${formatDay(effectiveTo)}` : ""}
        </span>
      ) : null}

      {onExplain ? (
        <button
          type="button"
          onClick={onExplain}
          className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs font-medium text-accent transition-colors duration-150 hover:bg-accent-soft"
        >
          <HelpCircle className="size-3.5" aria-hidden />
          Why?
          <span className="sr-only"> does {policyName} apply</span>
        </button>
      ) : null}
    </div>
  )
}
