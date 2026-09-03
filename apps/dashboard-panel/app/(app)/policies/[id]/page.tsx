"use client"

import { Suspense, use, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Archive, ArrowLeft, Flag, Scale, Users } from "lucide-react"
import { POLICY_STATUSES, type PolicyStatus } from "@policy/shared"
import { PageHeader } from "@/components/layout"
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FormErrorBanner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SkeletonRows,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui"
import { formatClause } from "@/components/conditions"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { formatDay, todayIso, useAsOf, withAsOf } from "@/lib/dates"
import { PERMISSIONS, useCan } from "@/lib/permissions"
import { useCategoryNames, useGroupNames } from "@/features/reference/hooks"
import { getPolicy, listPolicyAssignments } from "@/features/reference/api"
import { archivePolicy, patchPolicy } from "@/features/policies/api"
import { listRules } from "@/features/rules/api"
import { RULE_STATUS_TONE, compareRules, ordinal, ruleStatus } from "@/features/rules/status"

/**
 * Policy detail (design.md §27).
 *
 * The two questions worth asking about a policy are who holds it and what puts
 * it on them. Those are the two tabs, and both are read-only views over data the
 * engine produced rather than anything an admin edits here.
 */

const STATUS_TONE: Record<PolicyStatus, "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
}

const PolicyDetail = ({ id }: { id: string }) => {
  const { asOf } = useAsOf()
  const queryClient = useQueryClient()
  const canWrite = useCan(PERMISSIONS.POLICY_WRITE)
  const { get: categoryOf } = useCategoryNames()
  const { nameOf: groupName } = useGroupNames()

  const [tab, setTab] = useState("holders")

  const policy = useQuery({
    queryKey: queryKeys.policy(id),
    queryFn: ({ signal }) => getPolicy(id, signal),
    ...QUERY_TIERS.READ,
  })

  const holders = useQuery({
    queryKey: queryKeys.policyAssignments(id, asOf, 1),
    queryFn: ({ signal }) => listPolicyAssignments(id, asOf, signal),
    ...QUERY_TIERS.READ,
  })

  const rules = useQuery({
    queryKey: queryKeys.rules({ policyId: id }),
    queryFn: ({ signal }) =>
      listRules({ policyId: id }, { limit: 100, offset: 0 }, signal),
    ...QUERY_TIERS.READ,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.policy(id) })
    void queryClient.invalidateQueries({ queryKey: ["policies"] })
  }

  const setStatus = useMutation({
    mutationFn: (status: PolicyStatus) => patchPolicy(id, { status }),
    onSuccess: invalidate,
  })

  const archive = useMutation({
    mutationFn: () => archivePolicy(id),
    onSuccess: invalidate,
  })

  if (policy.isPending) return <SkeletonRows rows={8} />
  if (policy.error)
    return <ErrorState error={policy.error} onRetry={() => policy.refetch()} />

  const current = policy.data!
  const category = categoryOf(current.categoryId)
  const ordered = [...(rules.data?.items ?? [])].sort(compareRules)
  const day = asOf ?? todayIso()

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={withAsOf("/policies", asOf)}>
          <ArrowLeft aria-hidden />
          Policies
        </Link>
      </Button>

      <PageHeader
        title={current.name}
        description={current.description ?? undefined}
        actions={
          canWrite ? (
            <>
              <Select
                value={current.status}
                onValueChange={(value) => setStatus.mutate(value as PolicyStatus)}
              >
                <SelectTrigger aria-label="Policy status" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="secondary"
                loading={archive.isPending}
                disabled={current.status === "ARCHIVED"}
                onClick={() => archive.mutate()}
              >
                <Archive aria-hidden />
                Archive
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[current.status]}>{current.status}</Badge>
        {category ? (
          <>
            <span className="text-sm text-ink-muted">{category.name}</span>
            <Badge tone={category.cardinality === "SINGLE" ? "info" : "outline"}>
              {category.cardinality === "SINGLE"
                ? "One per employee"
                : "Several allowed"}
            </Badge>
          </>
        ) : null}
      </div>

      {current.status !== "ACTIVE" ? (
        <p className="mb-4 rounded-md border border-status-warning/35 bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
          {current.status === "DRAFT"
            ? "This policy is a draft. The engine skips it, so no rule pointing at it assigns anything yet."
            : "This policy is archived. Existing assignments are ended by the next reconciliation."}
        </p>
      ) : null}

      {setStatus.error ? <FormErrorBanner error={setStatus.error} /> : null}
      {archive.error ? <FormErrorBanner error={archive.error} /> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="holders">Who holds it</TabsTrigger>
          <TabsTrigger value="rules">What assigns it</TabsTrigger>
        </TabsList>

        <TabsContent value="holders">
          {holders.isPending ? (
            <SkeletonRows rows={6} />
          ) : holders.error ? (
            <ErrorState error={holders.error} onRetry={() => holders.refetch()} />
          ) : holders.data!.total === 0 ? (
            <EmptyState
              icon={Users}
              title="Nobody holds this policy right now."
              description="Either no rule assigns it, or every rule that does is losing to a higher-priority one."
            />
          ) : (
            <>
              <p className="tabular mb-2 text-xs text-ink-subtle">
                {holders.data!.total.toLocaleString()} employee
                {holders.data!.total === 1 ? "" : "s"}, showing{" "}
                {holders.data!.items.length}
              </p>

              <TableContainer>
                <Table>
                  <TableCaption>Employees currently assigned this policy.</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="hidden md:table-cell">Source rule</TableHead>
                      <TableHead className="text-right">Effective</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holders.data!.items.map((holder) => (
                      <TableRow key={holder.id}>
                        <TableCell>
                          <Link
                            href={withAsOf(`/employees/${holder.employeeId}`, asOf)}
                            className="flex flex-col gap-0.5"
                          >
                            <span className="font-medium text-ink hover:underline">
                              {holder.employeeName}
                            </span>
                            <span className="text-xs text-ink-subtle">
                              {holder.employeeEmail}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {holder.resolutionStatus === "MANUAL_OVERRIDE" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-status-info">
                              <Flag className="size-3" aria-hidden />
                              Manual override
                            </span>
                          ) : (
                            <Link
                              href={withAsOf(`/rules/${holder.sourceRuleId}`, asOf)}
                              className="text-ink-muted hover:underline"
                            >
                              {holder.sourceRuleName}
                              <span className="tabular font-mono text-xs text-ink-subtle">
                                {" "}
                                v{holder.sourceRuleVersion}
                              </span>
                            </Link>
                          )}
                        </TableCell>
                        <TableCell className="tabular text-right text-xs text-ink-muted">
                          {formatDay(holder.effectiveFrom)}
                          {holder.effectiveTo
                            ? ` to ${formatDay(holder.effectiveTo)}`
                            : ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </TabsContent>

        <TabsContent value="rules">
          {rules.isPending ? (
            <SkeletonRows rows={4} />
          ) : rules.error ? (
            <ErrorState error={rules.error} onRetry={() => rules.refetch()} />
          ) : ordered.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="No rule assigns this policy."
              description="Until one does, nobody can receive it."
              action={
                <Button asChild size="sm" variant="primary">
                  <Link href={`/rules/new?policyId=${id}`}>Create a rule</Link>
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-bg">
              {ordered.map((rule, index) => {
                const status = ruleStatus(rule, day)

                return (
                  <li key={rule.id}>
                    <Link
                      href={withAsOf(`/rules/${rule.id}`, asOf)}
                      className="flex items-start gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-surface"
                    >
                      <span className="tabular mt-0.5 w-8 shrink-0 font-mono text-xs text-ink-subtle">
                        {ordinal(index)}
                      </span>

                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">{rule.name}</span>
                          <Badge tone="outline">{rule.ruleType}</Badge>
                          <Badge tone={RULE_STATUS_TONE[status]}>{status}</Badge>
                        </span>
                        <span className="truncate text-xs text-ink-muted">
                          {rule.conditions.all.length === 0
                            ? rule.ruleType === "MANUAL"
                              ? "Targets one employee directly"
                              : "Applies to everyone"
                            : rule.conditions.all
                                .map((clause) => formatClause(clause, groupName))
                                .join(" and ")}
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
          )}

          {category?.cardinality === "SINGLE" && ordered.length > 1 ? (
            <p className="mt-2 text-xs text-ink-subtle">
              These rules compete. When more than one matches an employee, the highest
              placed rule is the one that assigns.
            </p>
          ) : null}
        </TabsContent>
      </Tabs>
    </>
  )
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <PolicyDetail id={id} />
    </Suspense>
  )
}
