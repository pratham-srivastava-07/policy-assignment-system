"use client"

import { useMemo } from "react"
import { Plus, X } from "lucide-react"
import {
  RULE_CONDITIONS_VERSION,
  type ConditionAttribute,
  type ConditionClause,
  type ConditionOperator,
  type ConditionValue,
  type RuleConditions,
} from "@policy/shared"
import { cn } from "@/lib/utils"
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui"
import {
  ATTRIBUTES,
  ATTRIBUTE_LABELS,
  attributeKind,
  clauseKey,
  daysToYears,
  isListOperator,
  operatorLabel,
  operatorsFor,
  yearsToDays,
} from "./attribute-meta"
import { formatClause, type GroupNameLookup } from "./condition-sentence"

/**
 * The rule condition builder (design.md §18).
 *
 * The editor state is a tree even though the envelope is flat and AND-only
 * (§19): `all` is the root node, and a v2 envelope with nested ANY would add a
 * node type rather than replace this component. No AND/OR controls are shown,
 * because the backend cannot express them and offering them would promise a
 * rule the server will reject.
 *
 * Visual rather than a column of dropdowns: each clause is a card that reads as
 * a sentence, numbered by its position in the AND chain, with the plain-English
 * restatement underneath so a non-engineer can check it without parsing the
 * controls.
 */

export interface GroupOption {
  id: string
  name: string
}

const defaultValueFor = (
  attribute: ConditionAttribute,
  operator: ConditionOperator,
): ConditionValue => {
  const kind = attributeKind(attribute)

  if (isListOperator(operator)) return []
  if (kind === "numeric") return 0
  if (kind === "boolean") return true

  return ""
}

export const emptyClause = (): ConditionClause => ({
  attribute: "department",
  op: "eq",
  value: "",
})

export const toRuleConditions = (clauses: ConditionClause[]): RuleConditions => ({
  version: RULE_CONDITIONS_VERSION,
  all: clauses,
})

/** A clause the server would reject, described in the user's terms. */
export const clauseProblem = (
  clause: ConditionClause,
  index: number,
  clauses: ConditionClause[],
): string | null => {
  const duplicate = clauses.findIndex(
    (other, position) =>
      position < index && clauseKey(other.attribute, other.op) === clauseKey(clause.attribute, clause.op),
  )

  if (duplicate !== -1) {
    return `${ATTRIBUTE_LABELS[clause.attribute]} ${operatorLabel(clause.attribute, clause.op)} is already used above.`
  }

  if (Array.isArray(clause.value)) {
    return clause.value.length === 0 ? "Add at least one value." : null
  }

  if (attributeKind(clause.attribute) === "numeric") {
    return Number.isFinite(Number(clause.value)) ? null : "Enter a number of years."
  }

  if (attributeKind(clause.attribute) === "boolean") return null

  return String(clause.value).trim().length === 0 ? "Enter a value." : null
}

const ValueControl = ({
  clause,
  groups,
  onChange,
}: {
  clause: ConditionClause
  groups: GroupOption[]
  onChange: (value: ConditionValue) => void
}) => {
  const kind = attributeKind(clause.attribute)
  const list = isListOperator(clause.op)

  if (kind === "boolean") {
    return (
      <Select
        value={clause.value === true ? "true" : "false"}
        onValueChange={(next) => onChange(next === "true")}
      >
        <SelectTrigger aria-label="Value" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="true">a manager</SelectItem>
          <SelectItem value="false">not a manager</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  // §18.4: `groupId` is one of the two attributes with a real picker, because a
  // group list exists. A UUID is never shown.
  if (kind === "group" && !list) {
    return (
      <Select value={String(clause.value ?? "")} onValueChange={(next) => onChange(next)}>
        <SelectTrigger aria-label="Group" className="w-full">
          <SelectValue placeholder="Choose a group" />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (kind === "group" && list) {
    const selected = Array.isArray(clause.value) ? clause.value.map(String) : []

    return (
      <div className="flex flex-wrap gap-1.5">
        {groups.map((group) => {
          const active = selected.includes(group.id)

          return (
            <button
              key={group.id}
              type="button"
              aria-pressed={active}
              onClick={() =>
                onChange(
                  active
                    ? selected.filter((id) => id !== group.id)
                    : [...selected, group.id],
                )
              }
              className={cn(
                "h-7 rounded-sm border px-2 text-xs transition-colors duration-150",
                active
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-border text-ink-muted hover:bg-surface hover:text-ink",
              )}
            >
              {group.name}
            </button>
          )
        })}
      </div>
    )
  }

  // §18.5: tenure is entered in years and stored in days.
  if (kind === "numeric") {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          aria-label="Years"
          className="tabular w-24"
          value={String(daysToYears(Number(clause.value) || 0))}
          onChange={(event) => onChange(yearsToDays(Number(event.target.value) || 0))}
        />
        <span className="text-sm text-ink-muted">years</span>
        <span className="tabular text-xs text-ink-subtle">
          stored as {Number(clause.value) || 0} days
        </span>
      </div>
    )
  }

  if (list) {
    const values = Array.isArray(clause.value) ? clause.value.map(String) : []

    return (
      <Input
        aria-label="Values, comma separated"
        placeholder="CA, NY, WA"
        value={values.join(", ")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split(",")
              .map((entry) => entry.trim())
              .filter((entry) => entry.length > 0),
          )
        }
      />
    )
  }

  return (
    <Input
      aria-label="Value"
      placeholder="CA"
      value={String(clause.value ?? "")}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export const ConditionBuilder = ({
  clauses,
  groups,
  disabled = false,
  onChange,
}: {
  clauses: ConditionClause[]
  groups: GroupOption[]
  disabled?: boolean
  onChange: (next: ConditionClause[]) => void
}) => {
  const groupName: GroupNameLookup = useMemo(() => {
    const index = new Map(groups.map((group) => [group.id, group.name]))

    return (id: string) => index.get(id)
  }, [groups])

  const usedPairs = useMemo(
    () => new Set(clauses.map((clause) => clauseKey(clause.attribute, clause.op))),
    [clauses],
  )

  const update = (index: number, next: ConditionClause) =>
    onChange(clauses.map((clause, position) => (position === index ? next : clause)))

  const changeAttribute = (index: number, attribute: ConditionAttribute) => {
    const allowed = operatorsFor(attribute)
    const current = clauses[index]!
    const operator = allowed.includes(current.op) ? current.op : allowed[0]!

    update(index, { attribute, op: operator, value: defaultValueFor(attribute, operator) })
  }

  const changeOperator = (index: number, operator: ConditionOperator) => {
    const current = clauses[index]!
    const wasList = isListOperator(current.op)
    const isList = isListOperator(operator)

    update(index, {
      ...current,
      op: operator,
      value: wasList === isList ? current.value : defaultValueFor(current.attribute, operator),
    })
  }

  if (clauses.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-border p-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-ink">No conditions yet</p>
          <p className="text-sm text-ink-muted">
            Without a condition this rule matches nobody. Add one to say who it applies to.
          </p>
        </div>
        <Button size="sm" disabled={disabled} onClick={() => onChange([emptyClause()])}>
          <Plus aria-hidden />
          Add condition
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {clauses.map((clause, index) => {
        const problem = clauseProblem(clause, index, clauses)

        return (
          <div key={index} className="flex flex-col gap-2">
            {index > 0 ? (
              <div className="flex items-center gap-2 pl-1">
                <span className="h-px w-4 bg-border" aria-hidden />
                <span className="text-xs font-medium tracking-wide text-ink-subtle">AND</span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
            ) : null}

            <div
              className={cn(
                "rounded-md border bg-bg p-3",
                problem ? "border-status-danger" : "border-border",
              )}
            >
              <div className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="tabular mt-1.5 w-5 shrink-0 text-xs text-ink-subtle"
                >
                  {index + 1}
                </span>

                <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
                  <Select
                    value={clause.attribute}
                    onValueChange={(next) => changeAttribute(index, next as ConditionAttribute)}
                    disabled={disabled}
                  >
                    <SelectTrigger aria-label="Attribute">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ATTRIBUTES.map((attribute) => {
                        const exhausted = operatorsFor(attribute).every(
                          (operator) =>
                            usedPairs.has(clauseKey(attribute, operator)) &&
                            !(attribute === clause.attribute && operator === clause.op),
                        )

                        return (
                          <SelectItem
                            key={attribute}
                            value={attribute}
                            disabled={exhausted && attribute !== clause.attribute}
                          >
                            {ATTRIBUTE_LABELS[attribute]}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>

                  <Select
                    value={clause.op}
                    onValueChange={(next) => changeOperator(index, next as ConditionOperator)}
                    disabled={disabled}
                  >
                    <SelectTrigger aria-label="Operator">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {operatorsFor(clause.attribute).map((operator) => (
                        <SelectItem
                          key={operator}
                          value={operator}
                          disabled={
                            operator !== clause.op &&
                            usedPairs.has(clauseKey(clause.attribute, operator))
                          }
                        >
                          {operatorLabel(clause.attribute, operator)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <ValueControl
                    clause={clause}
                    groups={groups}
                    onChange={(value) => update(index, { ...clause, value })}
                  />
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Remove condition ${index + 1}`}
                  disabled={disabled}
                  onClick={() => onChange(clauses.filter((_, position) => position !== index))}
                >
                  <X aria-hidden />
                </Button>
              </div>

              <p
                className={cn(
                  "mt-2 pl-7 text-xs",
                  problem ? "text-status-danger" : "text-ink-subtle",
                )}
              >
                {problem ?? formatClause(clause, groupName)}
              </p>
            </div>
          </div>
        )
      })}

      <div className="flex items-center gap-3 pt-1">
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || clauses.length >= ATTRIBUTES.length}
          onClick={() => onChange([...clauses, emptyClause()])}
        >
          <Plus aria-hidden />
          Add condition
        </Button>
        <p className="text-xs text-ink-subtle">
          Values are matched exactly. &quot;California&quot; will not match &quot;CA&quot;.
        </p>
      </div>
    </div>
  )
}
