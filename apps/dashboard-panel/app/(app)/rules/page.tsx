"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Plus, Scale, Search, X } from "lucide-react"
import { RULE_TYPES, type RuleDTO } from "@policy/shared"
import { PageHeader } from "@/components/layout"
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SkeletonRows,
} from "@/components/ui"
import { formatClause } from "@/components/conditions"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { formatDay, todayIso, useAsOf, withAsOf } from "@/lib/dates"
import { useCategoryNames, useGroupNames, usePolicyNames } from "@/features/reference/hooks"
import { listRules, type RuleFilters } from "@/features/rules/api"
import { RULE_STATUS_TONE, compareRules, ordinal, ruleStatus } from "@/features/rules/status"
import { PERMISSIONS, useCan } from "@/lib/permissions"

/**
 * The rule list (design.md §17).
 *
 * Grouped by the policy each rule assigns rather than listed flat, because a
 * priority only means something relative to the other rules competing for the
 * same thing. Within a group the order shown is the engine's own comparator, so
 * the first row is the rule that wins when several match.
 */

const PAGE_SIZE = 100

const RuleGroup = ({
  policyId,
  rules,
  asOf,
}: {
  policyId: string
  rules: RuleDTO[]
  asOf: string | null
}) => {
  const { nameOf: policyNameOf, get: policyOf } = usePolicyNames()
  const { get: categoryOf } = useCategoryNames()
  const { nameOf: groupName } = useGroupNames()

  const policy = policyOf(policyId)
  const category = policy ? categoryOf(policy.categoryId) : undefined
  const day = asOf ?? todayIso()
  const ordered = [...rules].sort(compareRules)

  return (
    <section className="rounded-md border border-border bg-bg">
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <h2 className="text-sm font-medium text-ink">{policyNameOf(policyId)}</h2>
        {category ? (
          <span className="text-xs text-ink-subtle">
            {category.name} &middot; {category.cardinality}
          </span>
        ) : null}
        <span className="tabular ml-auto font-mono text-xs text-ink-subtle">
          {ordered.length} rule{ordered.length === 1 ? "" : "s"}
        </span>
      </header>

      <ul className="divide-y divide-border">
        {ordered.map((rule, index) => {
          const status = ruleStatus(rule, day)

          return (
            <li key={rule.id}>
              <Link
                href={withAsOf(`/rules/${rule.id}`, asOf)}
                className="flex items-start gap-3 px-3 py-2 transition-colors duration-150 hover:bg-surface"
              >
                <span className="tabular mt-0.5 w-8 shrink-0 font-mono text-xs text-ink-subtle">
                  {ordinal(index)}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{rule.name}</span>
                    <Badge tone="outline">{rule.ruleType}</Badge>
                    <Badge tone={RULE_STATUS_TONE[status]}>{status}</Badge>
                  </span>

                  <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="min-w-0 truncate text-ink-muted">
                      {rule.conditions.all.length === 0
                        ? rule.ruleType === "MANUAL"
                          ? "Targets one employee directly"
                          : "Applies to everyone"
                        : rule.conditions.all
                            .map((clause) => formatClause(clause, groupName))
                            .join(" and ")}
                    </span>
                    <span className="tabular shrink-0 font-mono text-ink-subtle">
                      from {formatDay(rule.effectiveFrom)}
                      {rule.effectiveTo ? ` to ${formatDay(rule.effectiveTo)}` : ""} &middot; v
                      {rule.version}
                    </span>
                  </span>
                </span>

                <span className="tabular shrink-0 text-right font-mono text-sm text-ink">
                  {rule.priority}
                  <span className="block text-xs text-ink-subtle">priority</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const RuleListView = () => {
  const router = useRouter()
  const params = useSearchParams()
  const { asOf } = useAsOf()
  const canWrite = useCan(PERMISSIONS.RULE_WRITE)
  const { policies } = usePolicyNames()

  const [draft, setDraft] = useState(params.get("search") ?? "")

  const filters: RuleFilters = {
    search: params.get("search") ?? undefined,
    policyId: params.get("policyId") ?? undefined,
    ruleType: params.get("ruleType") ?? undefined,
    enabled: params.get("enabled") === null ? undefined : params.get("enabled") === "true",
  }

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())

    if (value === null || value === "" || value === "ALL") next.delete(key)
    else next.set(key, value)

    const query = next.toString()
    router.replace(query ? `/rules?${query}` : "/rules", { scroll: false })
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft !== (params.get("search") ?? "")) setParam("search", draft || null)
    }, 300)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const query = useQuery({
    queryKey: queryKeys.rules({ ...filters }),
    queryFn: ({ signal }) => listRules(filters, { limit: PAGE_SIZE, offset: 0 }, signal),
    ...QUERY_TIERS.READ,
  })

  const grouped = useMemo(() => {
    const byPolicy = new Map<string, RuleDTO[]>()

    for (const rule of query.data?.items ?? []) {
      const existing = byPolicy.get(rule.policyId)

      if (existing) existing.push(rule)
      else byPolicy.set(rule.policyId, [rule])
    }

    return Array.from(byPolicy.entries())
  }, [query.data])

  const chips = Object.entries(filters).filter(
    ([key, value]) => key !== "search" && value !== undefined,
  )

  return (
    <>
      <PageHeader
        title="Rules"
        description="Which employees receive which policy, and in what order rules win."
        actions={
          canWrite ? (
            <Button asChild variant="primary" size="sm">
              <Link href={withAsOf("/rules/new", asOf)}>
                <Plus aria-hidden />
                New rule
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search rules"
            aria-label="Search rules"
            className="pl-8"
          />
        </div>

        <Select
          value={params.get("policyId") ?? "ALL"}
          onValueChange={(value) => setParam("policyId", value)}
        >
          <SelectTrigger aria-label="Filter by policy" className="w-48">
            <SelectValue placeholder="Any policy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any policy</SelectItem>
            {policies.map((policy) => (
              <SelectItem key={policy.id} value={policy.id}>
                {policy.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={params.get("ruleType") ?? "ALL"}
          onValueChange={(value) => setParam("ruleType", value)}
        >
          <SelectTrigger aria-label="Filter by rule type" className="w-40">
            <SelectValue placeholder="Any type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any type</SelectItem>
            {RULE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={params.get("enabled") ?? "ALL"}
          onValueChange={(value) => setParam("enabled", value)}
        >
          <SelectTrigger aria-label="Filter by state" className="w-36">
            <SelectValue placeholder="Any state" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any state</SelectItem>
            <SelectItem value="true">Enabled</SelectItem>
            <SelectItem value="false">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {chips.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {chips.map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setParam(key, null)}
              className="inline-flex h-6 items-center gap-1 rounded-sm border border-border px-1.5 text-xs text-ink-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
            >
              {key}: {String(value)}
              <X className="size-3" aria-hidden />
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
        </div>
      ) : null}

      {query.isPending ? (
        <SkeletonRows rows={8} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Scale}
          title="No rules match these filters."
          description="A rule says which employees receive a policy. Its priority decides who wins when several match the same person."
          action={
            canWrite ? (
              <Button asChild size="sm" variant="primary">
                <Link href="/rules/new">Create a rule</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([policyId, rules]) => (
            <RuleGroup key={policyId} policyId={policyId} rules={rules} asOf={asOf} />
          ))}
        </div>
      )}
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <RuleListView />
    </Suspense>
  )
}
