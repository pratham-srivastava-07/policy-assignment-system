"use client"

import { useMemo } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { RULE_TYPE_PRIORITY_BANDS, type RuleDTO, type RuleType } from "@policy/shared"
import { cn } from "@/lib/utils"
import { compareRules } from "./status"

/**
 * What a priority change actually does, shown before it is saved (design.md §21).
 *
 * The honest version of "who is affected". The API cannot resolve a population
 * against a priority that does not exist yet, so this does not pretend to: it
 * re-runs the engine's own comparator over the rules already competing for this
 * policy and shows where the candidate lands. In a SINGLE category that ordering
 * IS the outcome, because the top matching rule is the one that wins.
 *
 * In a MULTIPLE category rules do not displace each other, so the panel says so
 * rather than implying a contest that is not happening.
 */

export interface PriorityCandidate {
  id: string | null
  name: string
  ruleType: RuleType
  priority: number
}

const asRule = (candidate: PriorityCandidate): RuleDTO =>
  ({
    id: candidate.id ?? "candidate",
    name: candidate.name,
    ruleType: candidate.ruleType,
    priority: candidate.priority,
    // `compareRules` reads only these four fields. A blank createdAt keeps a new
    // rule sorting after an existing one at equal priority, which is what the
    // server will do too once it is written.
    createdAt: "9999-12-31T00:00:00.000Z",
  }) as RuleDTO

export const PriorityImpact = ({
  candidate,
  siblings,
  cardinality,
  policyName,
}: {
  candidate: PriorityCandidate
  /** Every other rule assigning the same policy. */
  siblings: RuleDTO[]
  cardinality: "SINGLE" | "MULTIPLE" | undefined
  policyName: string
}) => {
  const { ordered, position, wasPosition } = useMemo(() => {
    const others = siblings.filter((rule) => rule.id !== candidate.id)
    const current = siblings.find((rule) => rule.id === candidate.id) ?? null

    const next = [...others, asRule(candidate)].sort(compareRules)
    const before = current ? [...others, current].sort(compareRules) : null

    return {
      ordered: next,
      position: next.findIndex((rule) => rule.id === (candidate.id ?? "candidate")),
      wasPosition: before ? before.findIndex((rule) => rule.id === candidate.id) : null,
    }
  }, [candidate, siblings])

  const moved = wasPosition !== null && wasPosition !== position
  const movedUp = moved && position < wasPosition!

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          Rules competing for {policyName}
        </p>
        {moved ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              movedUp ? "text-status-success" : "text-status-warning",
            )}
          >
            {movedUp ? (
              <ArrowUp className="size-3" aria-hidden />
            ) : (
              <ArrowDown className="size-3" aria-hidden />
            )}
            Moves from {wasPosition! + 1} to {position + 1}
          </span>
        ) : null}
      </div>

      <ol className="flex flex-col divide-y divide-border rounded-md border border-border bg-bg">
        {ordered.map((rule, index) => {
          const isCandidate = rule.id === (candidate.id ?? "candidate")
          const wins = index === 0

          return (
            <li
              key={rule.id}
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5",
                isCandidate && "bg-accent-soft",
              )}
            >
              <span className="tabular w-5 shrink-0 font-mono text-xs text-ink-subtle">
                {index + 1}
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  isCandidate ? "font-medium text-ink" : "text-ink-muted",
                )}
              >
                {rule.name}
                {isCandidate ? (
                  <span className="ml-1.5 text-xs text-accent">this rule</span>
                ) : null}
              </span>
              {cardinality === "SINGLE" && wins ? (
                <span className="shrink-0 text-xs font-medium text-status-success">
                  wins
                </span>
              ) : null}
              <span className="tabular w-10 shrink-0 text-right font-mono text-xs text-ink-subtle">
                {rule.priority}
              </span>
            </li>
          )
        })}
      </ol>

      <p className="text-xs text-ink-muted">
        {cardinality === "SINGLE"
          ? "Only one of these can apply to an employee. Whichever matching rule sits highest wins."
          : cardinality === "MULTIPLE"
            ? "This category allows several policies at once, so these rules do not displace each other. Order decides which rule is recorded as the source when more than one matches."
            : "Order is the engine comparator: priority first, then rule type band, then age."}
      </p>
    </div>
  )
}

export const defaultPriorityFor = (ruleType: RuleType): number =>
  RULE_TYPE_PRIORITY_BANDS[ruleType]
