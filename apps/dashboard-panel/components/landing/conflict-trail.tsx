"use client"

import { Crown } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatClause } from "@/components/conditions"
import { DEMO_EMPLOYEE, DEMO_RULES, resolve } from "./demo-data"

/**
 * Section two goes deep on the one thing the hero cannot show: when two rules
 * both match, which wins, and why.
 *
 * A vertical trail rather than a split, so the page does not repeat the hero's
 * layout. The trail is the same structure the workspace records for every real
 * assignment; this one just has two entries instead of twenty.
 */

const CATEGORY = "Vacation"

export const ConflictTrail = () => {
  const outcomes = resolve(DEMO_EMPLOYEE)
    .filter((outcome) => outcome.rule.category === CATEGORY)
    .sort((a, b) => b.rule.priority - a.rule.priority)

  const winner = outcomes.find((outcome) => outcome.decision === "WON")
  const loser = outcomes.find((outcome) => outcome.decision === "LOST")

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-16">
      <div className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          Two rules matched. One had to win.
        </h2>
        <p className="max-w-prose text-sm text-ink-muted">
          A vacation policy is single assignment: an employee cannot hold two at once.
          When more than one rule matches, the engine orders them by priority and records
          what happened to every rule it considered, including the ones that lost.
        </p>
        {winner && loser ? (
          <p className="text-sm text-ink">
            <span className="font-medium">{winner.rule.name}</span> won because priority{" "}
            <span className="tabular font-mono">{winner.rule.priority}</span> beats{" "}
            <span className="tabular font-mono">{loser.rule.priority}</span>.
          </p>
        ) : null}
      </div>

      <ol className="flex flex-col">
        {outcomes.map((outcome, index) => {
          const won = outcome.decision === "WON"

          return (
            <li key={outcome.rule.id} className="relative flex gap-4 pb-6 last:pb-0">
              <span
                className={cn(
                  "absolute top-6 bottom-0 left-[11px] w-px",
                  index === outcomes.length - 1 ? "hidden" : "bg-border",
                )}
                aria-hidden
              />

              <span
                className={cn(
                  "relative z-10 mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full border",
                  won
                    ? "border-status-success/40 bg-status-success-bg text-status-success"
                    : "border-border bg-surface text-ink-subtle",
                )}
              >
                {won ? (
                  <Crown className="size-3" aria-hidden />
                ) : (
                  <span className="tabular font-mono text-[10px]">{index + 1}</span>
                )}
              </span>

              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col gap-2 rounded-md border p-3",
                  won ? "border-status-success/35 bg-status-success-bg/40" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{outcome.rule.name}</span>
                  <span className="tabular font-mono text-xs text-ink-subtle">
                    priority {outcome.rule.priority}
                  </span>
                </div>

                <p className="font-mono text-xs text-ink-muted">
                  {outcome.rule.clauses.length === 0
                    ? "Applies to everyone"
                    : outcome.rule.clauses.map((clause) => formatClause(clause)).join(" and ")}
                </p>

                <p className="text-xs text-ink-muted">
                  {won
                    ? `Assigned ${outcome.rule.policy}.`
                    : `Matched, but ${outcome.rule.policy} was not assigned: a higher-priority rule already resolved this category.`}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

export const DEMO_RULE_COUNT = DEMO_RULES.length
