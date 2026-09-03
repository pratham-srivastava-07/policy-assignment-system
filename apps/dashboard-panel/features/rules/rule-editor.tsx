"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Play, Users } from "lucide-react"
import {
  RULE_TYPES,
  type ConditionClause,
  type RuleDTO,
  type RuleType,
} from "@policy/shared"
import {
  Button,
  Checkbox,
  Field,
  FormErrorBanner,
  Input,
  Label,
  RateLimitNotice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@/components/ui"
import { ConditionBuilder, clauseProblem, toRuleConditions } from "@/components/conditions"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { todayIso, useAsOf } from "@/lib/dates"
import { isApiError } from "@/lib/api"
import { useCategoryNames, useGroupNames, usePolicyNames } from "@/features/reference/hooks"
import * as rulesApi from "./api"
import { PriorityImpact, defaultPriorityFor } from "./priority-impact"

/**
 * The rule editor (design.md §18 to §21).
 *
 * Three things happen in one screen, in the order an admin thinks about them:
 * who the rule catches, which policy they get, and what happens when another
 * rule catches the same person. The last of those is why the priority panel sits
 * beside the field rather than behind a save.
 *
 * `ruleType` and `policyId` are fixed after creation because the server refuses
 * to patch them, so on an edit they render as read-only facts rather than
 * disabled controls a user will try to click.
 */

const TYPE_HELP: Record<RuleType, string> = {
  MANUAL: "Targets one named employee and overrides the automatic result.",
  ROLE: "Matches on job role.",
  DEPARTMENT: "Matches on department.",
  LOCATION: "Matches on state, country or location.",
  TENURE: "Matches on how long someone has been employed.",
  GROUP: "Matches on membership of a group.",
  DEFAULT: "Applies to everyone, as the organization-wide fallback.",
}

const CONDITIONLESS: readonly RuleType[] = ["DEFAULT", "MANUAL"]

export const RuleEditor = ({ rule }: { rule?: RuleDTO }) => {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { asOf } = useAsOf()
  const { policies, get: policyOf, nameOf: policyNameOf } = usePolicyNames()
  const { get: categoryOf } = useCategoryNames()
  const { groups } = useGroupNames()

  const editing = rule !== undefined

  const [name, setName] = useState(rule?.name ?? "")
  const [policyId, setPolicyId] = useState(rule?.policyId ?? "")
  const [ruleType, setRuleType] = useState<RuleType>(rule?.ruleType ?? "DEPARTMENT")
  const [priority, setPriority] = useState<number>(
    rule?.priority ?? defaultPriorityFor("DEPARTMENT"),
  )
  // Starts empty so the builder shows its own invitation rather than a blank
  // clause already flagged as invalid.
  const [clauses, setClauses] = useState<ConditionClause[]>(rule?.conditions.all ?? [])
  const [effectiveFrom, setEffectiveFrom] = useState(rule?.effectiveFrom ?? todayIso())
  const [effectiveTo, setEffectiveTo] = useState(rule?.effectiveTo ?? "")
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [simulated, setSimulated] = useState(false)
  /** Problems stay hidden until the admin asks to save (§40.2). */
  const [attempted, setAttempted] = useState(false)

  const conditionless = CONDITIONLESS.includes(ruleType)
  const activeClauses = conditionless ? [] : clauses

  const policy = policyId ? policyOf(policyId) : undefined
  const category = policy ? categoryOf(policy.categoryId) : undefined

  /** Every other rule assigning this policy, for the priority panel. */
  const siblings = useQuery({
    queryKey: queryKeys.rules({ policyId }),
    queryFn: ({ signal }) =>
      rulesApi.listRules({ policyId }, { limit: 100, offset: 0 }, signal),
    enabled: policyId !== "",
    ...QUERY_TIERS.READ,
  })

  const simulation = useQuery({
    queryKey: queryKeys.ruleSimulation({ ruleType, all: activeClauses }, asOf),
    queryFn: ({ signal }) =>
      rulesApi.simulateRule(
        { ruleType, conditions: toRuleConditions(activeClauses) },
        asOf,
        signal,
      ),
    enabled: simulated,
    ...QUERY_TIERS.EXPENSIVE,
  })

  const problems = useMemo(() => {
    const found: string[] = []

    if (name.trim().length === 0) found.push("Give the rule a name.")
    if (policyId === "") found.push("Choose the policy this rule assigns.")
    if (ruleType === "MANUAL")
      found.push("Create a manual override from the employee it applies to, not here.")
    if (!conditionless && activeClauses.length === 0)
      found.push("Add at least one condition, or change the type to Default.")
    if (effectiveTo !== "" && effectiveTo <= effectiveFrom)
      found.push("The end date must be after the start date.")

    for (const [index, clause] of activeClauses.entries()) {
      const problem = clauseProblem(clause, index, activeClauses)
      if (problem) found.push(`Condition ${index + 1}: ${problem}`)
    }

    return found
  }, [name, policyId, ruleType, conditionless, activeClauses, effectiveFrom, effectiveTo])

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        priority,
        conditions: toRuleConditions(activeClauses),
        enabled,
        effectiveFrom,
        effectiveTo: effectiveTo === "" ? null : effectiveTo,
      }

      return editing
        ? rulesApi.patchRule(rule!.id, body)
        : rulesApi.createRule({ ...body, policyId, ruleType })
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: ["rules"] })
      void queryClient.invalidateQueries({ queryKey: queryKeys.rule(saved.id) })
      router.push(`/rules/${saved.id}`)
    },
  })

  const changeType = (next: RuleType) => {
    setRuleType(next)
    // The band is a starting number, not a second ordering dimension. Only move
    // the priority when the admin has not already chosen one.
    if (priority === defaultPriorityFor(ruleType)) setPriority(defaultPriorityFor(next))
    setSimulated(false)
  }

  return (
    <form
      className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]"
      onSubmit={(event) => {
        event.preventDefault()
        setAttempted(true)
        if (problems.length === 0) save.mutate()
      }}
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-4 rounded-md border border-border p-4">
          <h2 className="text-sm font-medium text-ink">What this rule assigns</h2>

          <Field label="Rule name" id="rule-name">
            <Input
              id="rule-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="California meal break"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Policy" id="rule-policy">
              {editing ? (
                <p className="flex h-9 items-center text-sm text-ink">
                  {policyNameOf(rule!.policyId)}
                </p>
              ) : (
                <Select value={policyId} onValueChange={setPolicyId}>
                  <SelectTrigger id="rule-policy">
                    <SelectValue placeholder="Choose a policy" />
                  </SelectTrigger>
                  <SelectContent>
                    {policies.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field
              label="Rule type"
              id="rule-type"
              hint={editing ? undefined : TYPE_HELP[ruleType]}
            >
              {editing ? (
                <p className="flex h-9 items-center text-sm text-ink">{rule!.ruleType}</p>
              ) : (
                <Select
                  value={ruleType}
                  onValueChange={(value) => changeType(value as RuleType)}
                >
                  <SelectTrigger id="rule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.filter((type) => type !== "MANUAL").map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>

          {editing ? (
            <p className="text-xs text-ink-muted">
              Policy and rule type are fixed once a rule exists. Assigning a different
              policy is a new rule, so the history of this one stays readable.
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium text-ink">Who it applies to</h2>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setSimulated(true)}
              disabled={!conditionless && activeClauses.length === 0}
            >
              <Play aria-hidden />
              Check who matches
            </Button>
          </div>

          {conditionless ? (
            <p className="rounded-md border border-dashed border-border p-3 text-sm text-ink-muted">
              A Default rule applies to every active employee and takes no conditions.
            </p>
          ) : (
            <ConditionBuilder
              clauses={clauses}
              groups={groups.map((group) => ({ id: group.id, name: group.name }))}
              onChange={(next) => {
                setClauses(next)
                setSimulated(false)
              }}
            />
          )}

          {simulated ? (
            simulation.isPending ? (
              <Skeleton className="h-16 w-full" />
            ) : simulation.error ? (
              isApiError(simulation.error) && simulation.error.isRateLimited ? (
                <RateLimitNotice error={simulation.error} onRetry={() => simulation.refetch()} />
              ) : (
                <FormErrorBanner error={simulation.error} />
              )
            ) : (
              <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
                <p className="flex items-center gap-2 text-sm text-ink">
                  <Users className="size-4 text-ink-subtle" aria-hidden />
                  <span className="tabular font-mono font-medium">
                    {simulation.data!.total.toLocaleString()}
                  </span>
                  employee{simulation.data!.total === 1 ? "" : "s"} match these conditions
                </p>

                <ul className="flex flex-wrap gap-1.5">
                  {simulation.data!.items.slice(0, 12).map((match) => (
                    <li
                      key={match.employeeId}
                      className="rounded-sm border border-border bg-bg px-1.5 py-0.5 text-xs text-ink-muted"
                    >
                      {match.name}
                    </li>
                  ))}
                  {simulation.data!.total > 12 ? (
                    <li className="px-1.5 py-0.5 text-xs text-ink-subtle">
                      and {(simulation.data!.total - 12).toLocaleString()} more
                    </li>
                  ) : null}
                </ul>

                <p className="text-xs text-ink-subtle">
                  Matching is not the same as receiving. Whether these employees end up
                  with the policy also depends on priority and on the cardinality of its
                  category.
                </p>
              </div>
            )
          ) : null}
        </section>

        <section className="flex flex-col gap-4 rounded-md border border-border p-4">
          <h2 className="text-sm font-medium text-ink">When it is in effect</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Effective from" id="rule-from">
              <Input
                id="rule-from"
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </Field>

            <Field
              label="Effective to"
              id="rule-to"
              hint="Exclusive, and optional. A rule ending on a date is not in effect that day."
            >
              <Input
                id="rule-to"
                type="date"
                value={effectiveTo}
                onChange={(event) => setEffectiveTo(event.target.value)}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <Checkbox
              checked={enabled}
              onCheckedChange={(value) => setEnabled(value === true)}
            />
            Enabled
          </label>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-md border border-border p-4">
          <Label htmlFor="rule-priority">Priority</Label>
          <Input
            id="rule-priority"
            type="number"
            min={0}
            max={1000}
            value={priority}
            className="tabular font-mono"
            onChange={(event) => setPriority(Number(event.target.value))}
          />
          <p className="text-xs text-ink-muted">
            Higher wins. Priority is the only authority for conflicts: a Department rule
            at 900 beats a Manual rule at 100.
          </p>
        </section>

        {policyId !== "" && siblings.data ? (
          <PriorityImpact
            candidate={{
              id: rule?.id ?? null,
              name: name.trim() === "" ? "This rule" : name.trim(),
              ruleType,
              priority,
            }}
            siblings={siblings.data.items}
            cardinality={category?.cardinality}
            policyName={policyNameOf(policyId)}
          />
        ) : null}

        {attempted && problems.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-md border border-status-warning/35 bg-status-warning-bg p-3 text-xs text-status-warning">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}

        {save.error ? <FormErrorBanner error={save.error} /> : null}

        <div className="flex gap-2">
          <Button type="submit" variant="primary" loading={save.isPending}>
            {editing ? "Save changes" : "Create rule"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
        </div>

        {editing ? (
          <p className="text-xs text-ink-subtle">
            Saving writes a new version. Assignments already made keep pointing at the
            version that produced them.
          </p>
        ) : null}
      </aside>
    </form>
  )
}
