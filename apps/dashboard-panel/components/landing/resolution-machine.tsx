"use client"

import { useMemo, useState } from "react"
import { ArrowLeftRight, Check, Minus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatClause } from "@/components/conditions"
import { DiffRow, PolicyChip } from "@/components/policy"
import {
  DEMO_EMPLOYEE,
  resolve,
  winningPolicies,
  type DemoDecision,
  type DemoEmployee,
  type DemoOutcome,
} from "./demo-data"

/**
 * The hero visual.
 *
 * Change one attribute and the rule stack re-evaluates in front of you: rules
 * flip between matched and unmatched, one wins each single-assignment category,
 * and the policy diff lands underneath. It is the shortest true account of what
 * the product does, so it is the page's whole argument rather than an
 * illustration beside one.
 */

const DECISION_META: Record<
  DemoDecision,
  { label: string; icon: typeof Check; ring: string; text: string; fill: string }
> = {
  WON: {
    label: "Won",
    icon: Check,
    ring: "border-status-success/40",
    text: "text-status-success",
    fill: "bg-status-success-bg",
  },
  LOST: {
    label: "Lost",
    icon: Minus,
    ring: "border-status-warning/40",
    text: "text-status-warning",
    fill: "bg-status-warning-bg",
  },
  NO_MATCH: {
    label: "No match",
    icon: X,
    ring: "border-border",
    text: "text-ink-subtle",
    fill: "bg-surface",
  },
}

const AttributeSwitch = ({
  label,
  value,
  onFlip,
}: {
  label: string
  value: string
  onFlip: () => void
}) => (
  <button
    type="button"
    onClick={onFlip}
    className="group flex items-center gap-2 rounded-md border border-border bg-bg px-2 py-1.5 text-left transition-colors duration-150 hover:border-accent hover:bg-accent-soft"
  >
    <span className="flex flex-col">
      <span className="text-xs text-ink-subtle">{label}</span>
      <span className="font-mono text-sm font-medium text-ink">{value}</span>
    </span>
    <ArrowLeftRight
      className="size-3.5 shrink-0 text-ink-subtle transition-colors duration-150 group-hover:text-accent"
      aria-hidden
    />
    <span className="sr-only">Change {label}</span>
  </button>
)

const RuleRow = ({ outcome, changed }: { outcome: DemoOutcome; changed: boolean }) => {
  const meta = DECISION_META[outcome.decision]
  const Glyph = meta.icon
  const sentence =
    outcome.rule.clauses.length === 0
      ? "Applies to everyone"
      : outcome.rule.clauses.map((clause) => formatClause(clause)).join(" and ")

  return (
    <li
      className={cn(
        "flex items-center gap-3 px-3 py-1",
        changed && "animate-diff-settle",
      )}
    >
      <span
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-sm border",
          meta.ring,
          meta.fill,
          meta.text,
        )}
      >
        <Glyph className="size-3" aria-hidden />
      </span>

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-ink">{outcome.rule.name}</span>
        <span
          className={cn(
            "truncate font-mono text-xs",
            outcome.failed ? "text-status-danger" : "text-ink-subtle",
          )}
        >
          {sentence}
        </span>
      </span>

      <span className="tabular hidden shrink-0 font-mono text-xs text-ink-subtle sm:inline">
        {outcome.rule.priority}
      </span>

      <span className={cn("w-16 shrink-0 text-right text-xs font-medium", meta.text)}>
        {meta.label}
      </span>
    </li>
  )
}

export const ResolutionMachine = () => {
  const [employee, setEmployee] = useState<DemoEmployee>(DEMO_EMPLOYEE)
  const [previous, setPrevious] = useState<DemoEmployee | null>(null)

  const outcomes = useMemo(() => resolve(employee), [employee])
  const before = useMemo(() => (previous ? resolve(previous) : null), [previous])

  const winners = winningPolicies(outcomes)

  const { added, removed, changedRules } = useMemo(() => {
    if (!before) return { added: [], removed: [], changedRules: new Set<string>() }

    const now = new Set(winningPolicies(outcomes).map((outcome) => outcome.rule.policy))
    const then = new Set(winningPolicies(before).map((outcome) => outcome.rule.policy))

    const decisions = new Map(before.map((outcome) => [outcome.rule.id, outcome.decision]))

    return {
      added: winningPolicies(outcomes).filter((outcome) => !then.has(outcome.rule.policy)),
      removed: winningPolicies(before).filter((outcome) => !now.has(outcome.rule.policy)),
      changedRules: new Set(
        outcomes
          .filter((outcome) => decisions.get(outcome.rule.id) !== outcome.decision)
          .map((outcome) => outcome.rule.id),
      ),
    }
  }, [before, outcomes])

  const flip = (patch: Partial<DemoEmployee>) => {
    setPrevious(employee)
    setEmployee({ ...employee, ...patch })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg shadow-lg">
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-3 py-3">
        <span className="flex min-w-0 flex-col pr-1">
          <span className="truncate text-sm font-medium text-ink">
            {DEMO_EMPLOYEE.name}
          </span>
          <span className="truncate text-xs text-ink-subtle">{DEMO_EMPLOYEE.title}</span>
        </span>

        <AttributeSwitch
          label="Department"
          value={employee.department}
          onFlip={() =>
            flip({
              department: employee.department === "Engineering" ? "Sales" : "Engineering",
            })
          }
        />
        <AttributeSwitch
          label="State"
          value={employee.state}
          onFlip={() => flip({ state: employee.state === "CA" ? "NY" : "CA" })}
        />
      </div>

      <div className="border-b border-border">
        <p className="px-3 pt-3 pb-1 text-xs font-medium text-ink-muted">
          Rules considered
        </p>
        <ul className="divide-y divide-border">
          {outcomes.map((outcome) => (
            <RuleRow
              key={outcome.rule.id}
              outcome={outcome}
              changed={changedRules.has(outcome.rule.id)}
            />
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs font-medium text-ink-muted">
          Policies Priya receives
          <span className="tabular font-mono text-ink-subtle">{winners.length}</span>
        </p>

        {/* Always rendered, so the diff landing does not push the page around. */}
        <div
          className={cn(
            "grid min-h-[4.5rem] content-center gap-x-4 rounded-md px-2 py-1 sm:grid-cols-2",
            added.length === 0 && removed.length === 0
              ? "border border-dashed border-border"
              : "border border-border bg-surface",
          )}
        >
          {added.length === 0 && removed.length === 0 ? (
            <p className="px-1 text-center text-xs text-ink-subtle sm:col-span-2">
              Flip an attribute above to see what changes.
            </p>
          ) : (
            <>
              {removed.map((outcome) => (
                <DiffRow key={`out-${outcome.rule.id}`} kind="removed">
                  <span className="text-sm text-ink">{outcome.rule.policy}</span>
                </DiffRow>
              ))}
              {added.map((outcome) => (
                <DiffRow key={`in-${outcome.rule.id}`} kind="added">
                  <span className="text-sm text-ink">{outcome.rule.policy}</span>
                </DiffRow>
              ))}
            </>
          )}
        </div>

        <div className="grid gap-1.5 sm:grid-cols-2">
          {winners.map((outcome) => (
            <PolicyChip
              key={outcome.rule.id}
              policyName={outcome.rule.policy}
              categoryName={outcome.rule.category}
              sourceRuleName={outcome.rule.name}
              className="animate-diff-enter"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
