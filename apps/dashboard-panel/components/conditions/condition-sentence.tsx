"use client"

import type { AttributeValues, ConditionClause, ConditionScalar } from "@policy/shared"
import { cn } from "@/lib/utils"
import {
  ATTRIBUTE_LABELS,
  attributeKind,
  formatTenureDays,
  operatorLabel,
} from "./attribute-meta"

/**
 * One clause, rendered as a sentence.
 *
 * The single renderer for conditions everywhere they appear, so `state equals
 * CA` is worded identically in the builder, on rule detail, in the explanation
 * drawer and in a near-miss card (design.md §37, §42).
 */

export type GroupNameLookup = (groupId: string) => string | undefined

const formatScalar = (
  clause: ConditionClause,
  value: ConditionScalar,
  groupName?: GroupNameLookup,
): string => {
  const kind = attributeKind(clause.attribute)

  if (kind === "boolean") return value ? "yes" : "no"
  if (kind === "numeric") return formatTenureDays(Number(value))

  // §18.4 and §29.5: a group id in a rule always renders as its name. A deleted
  // group cannot be read back at all, so it says so rather than showing a UUID.
  if (kind === "group") {
    return groupName?.(String(value)) ?? "a deleted group"
  }

  return String(value)
}

export const formatClauseValue = (
  clause: ConditionClause,
  groupName?: GroupNameLookup,
): string => {
  if (Array.isArray(clause.value)) {
    const parts = clause.value.map((entry) => formatScalar(clause, entry, groupName))

    return parts.length <= 1 ? (parts[0] ?? "nothing") : `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}`
  }

  return formatScalar(clause, clause.value, groupName)
}

/** `Tenure at least 1,825 days (~5 years)` */
export const formatClause = (
  clause: ConditionClause,
  groupName?: GroupNameLookup,
): string =>
  `${ATTRIBUTE_LABELS[clause.attribute]} ${operatorLabel(clause.attribute, clause.op)} ${formatClauseValue(clause, groupName)}`

/**
 * The employee's own value for this clause's attribute, as recorded at
 * evaluation time (§14.3). Not their value today: for a January assignment,
 * today's value is the wrong answer.
 */
const formatObserved = (
  clause: ConditionClause,
  values: AttributeValues,
  groupName?: GroupNameLookup,
): string | null => {
  const observed = values[clause.attribute]

  if (observed === undefined) return null
  if (observed === null) return "not set"

  if (Array.isArray(observed)) {
    if (observed.length === 0) return "no groups"

    return observed
      .map((entry) => groupName?.(entry) ?? "a deleted group")
      .join(", ")
  }

  const kind = attributeKind(clause.attribute)

  if (kind === "boolean") return observed ? "yes" : "no"
  if (kind === "numeric") return formatTenureDays(Number(observed))

  return String(observed)
}

export const ConditionSentence = ({
  clause,
  attributeValues,
  subject,
  tone = "neutral",
  groupName,
  className,
}: {
  clause: ConditionClause
  /** When present, the employee's value is shown beneath the clause. */
  attributeValues?: AttributeValues
  /** Whose value it is, e.g. "Alice". Only used when `attributeValues` is given. */
  subject?: string
  tone?: "matched" | "failed" | "neutral"
  groupName?: GroupNameLookup
  className?: string
}) => {
  const observed = attributeValues
    ? formatObserved(clause, attributeValues, groupName)
    : null

  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span
        className={cn(
          "text-sm",
          tone === "matched" && "text-ink",
          tone === "failed" && "text-ink",
          tone === "neutral" && "text-ink",
        )}
      >
        <span className="text-ink-muted">{ATTRIBUTE_LABELS[clause.attribute]}</span>{" "}
        <span className="text-ink-subtle">{operatorLabel(clause.attribute, clause.op)}</span>{" "}
        <span className="font-medium">{formatClauseValue(clause, groupName)}</span>
      </span>
      {observed !== null ? (
        <span className="tabular text-xs text-ink-subtle">
          {subject ? `${subject}: ` : "Observed: "}
          {observed}
        </span>
      ) : null}
    </div>
  )
}
