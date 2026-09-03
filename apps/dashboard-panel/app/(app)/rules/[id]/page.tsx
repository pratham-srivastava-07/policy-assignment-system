"use client"

import { Suspense, use, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Ban, Check, Pencil, Users } from "lucide-react"
import type { RuleVersionDTO } from "@policy/shared"
import { PageHeader } from "@/components/layout"
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FormErrorBanner,
  RateLimitNotice,
  Skeleton,
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
import { ConditionSentence } from "@/components/conditions"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { formatDay, formatDayTime, todayIso, useAsOf, withAsOf } from "@/lib/dates"
import { isApiError } from "@/lib/api"
import { PERMISSIONS, useCan } from "@/lib/permissions"
import {
  useActorNames,
  useCategoryNames,
  useGroupNames,
  usePolicyNames,
} from "@/features/reference/hooks"
import * as rulesApi from "@/features/rules/api"
import { RULE_STATUS_TONE, ruleStatus } from "@/features/rules/status"
import { PriorityImpact } from "@/features/rules/priority-impact"

/**
 * Rule detail (design.md §22 to §24).
 *
 * Answers three questions in the order they get asked: what does this rule say,
 * who does it currently catch, and what did it say before. The contest panel is
 * on the first tab rather than hidden, because a rule read on its own tells you
 * nothing about whether it actually wins.
 */

const VersionRow = ({
  version,
  previous,
  actorName,
}: {
  version: RuleVersionDTO
  previous: RuleVersionDTO | undefined
  actorName: (id: string | null) => string
}) => {
  const changes: string[] = []

  if (previous) {
    if (previous.name !== version.name) changes.push(`renamed to ${version.name}`)
    if (previous.priority !== version.priority)
      changes.push(`priority ${previous.priority} to ${version.priority}`)
    if (previous.enabled !== version.enabled)
      changes.push(version.enabled ? "enabled" : "disabled")
    if (previous.effectiveFrom !== version.effectiveFrom)
      changes.push(`starts ${formatDay(version.effectiveFrom)}`)
    if ((previous.effectiveTo ?? "") !== (version.effectiveTo ?? ""))
      changes.push(
        version.effectiveTo ? `ends ${formatDay(version.effectiveTo)}` : "end date cleared",
      )
    if (
      JSON.stringify(previous.conditions.all) !== JSON.stringify(version.conditions.all)
    )
      changes.push("conditions changed")
  }

  return (
    <TableRow>
      <TableCell className="tabular font-mono text-ink-muted">v{version.version}</TableCell>
      <TableCell className="tabular text-ink-muted">
        {formatDayTime(version.createdAt)}
      </TableCell>
      <TableCell className="text-ink-muted">{actorName(version.createdBy)}</TableCell>
      <TableCell className="text-ink">
        {previous === undefined
          ? "Created"
          : changes.length === 0
            ? "No evaluable change"
            : changes.join(", ")}
      </TableCell>
    </TableRow>
  )
}

const RuleDetail = ({ id }: { id: string }) => {
  const { asOf } = useAsOf()
  const queryClient = useQueryClient()
  const canWrite = useCan(PERMISSIONS.RULE_WRITE)
  const { nameOf: policyNameOf, get: policyOf } = usePolicyNames()
  const { get: categoryOf } = useCategoryNames()
  const { nameOf: groupName } = useGroupNames()
  const { nameOf: actorName } = useActorNames()

  const [tab, setTab] = useState("overview")

  const rule = useQuery({
    queryKey: queryKeys.rule(id),
    queryFn: ({ signal }) => rulesApi.getRule(id, signal),
    ...QUERY_TIERS.READ,
  })

  const versions = useQuery({
    queryKey: queryKeys.ruleVersions(id),
    queryFn: ({ signal }) => rulesApi.listRuleVersions(id, signal),
    ...QUERY_TIERS.READ,
  })

  const siblings = useQuery({
    queryKey: queryKeys.rules({ policyId: rule.data?.policyId }),
    queryFn: ({ signal }) =>
      rulesApi.listRules(
        { policyId: rule.data!.policyId },
        { limit: 100, offset: 0 },
        signal,
      ),
    enabled: rule.data !== undefined,
    ...QUERY_TIERS.READ,
  })

  const matching = useQuery({
    queryKey: queryKeys.ruleMatchingEmployees(id, asOf, {}),
    queryFn: ({ signal }) => rulesApi.listMatchingEmployees(id, asOf, signal),
    enabled: tab === "matching",
    ...QUERY_TIERS.EXPENSIVE,
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.rule(id) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.ruleVersions(id) })
    void queryClient.invalidateQueries({ queryKey: ["rules"] })
  }

  const toggle = useMutation({
    mutationFn: () =>
      rule.data!.enabled ? rulesApi.disableRule(id) : rulesApi.enableRule(id),
    onSuccess: invalidate,
  })

  const retire = useMutation({
    mutationFn: () => rulesApi.retireRule(id),
    onSuccess: invalidate,
  })

  if (rule.isPending) return <SkeletonRows rows={8} />
  if (rule.error) return <ErrorState error={rule.error} onRetry={() => rule.refetch()} />

  const current = rule.data!
  const status = ruleStatus(current, asOf ?? todayIso())
  const policy = policyOf(current.policyId)
  const category = policy ? categoryOf(policy.categoryId) : undefined
  const history = [...(versions.data?.items ?? [])].sort((a, b) => a.version - b.version)

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={withAsOf("/rules", asOf)}>
          <ArrowLeft aria-hidden />
          Rules
        </Link>
      </Button>

      <PageHeader
        title={current.name}
        description={`Assigns ${policyNameOf(current.policyId)}${
          category ? ` in ${category.name}, ${category.cardinality} assignment` : ""
        }.`}
        actions={
          canWrite ? (
            <>
              <Button
                size="sm"
                variant="secondary"
                loading={toggle.isPending}
                onClick={() => toggle.mutate()}
              >
                {current.enabled ? <Ban aria-hidden /> : <Check aria-hidden />}
                {current.enabled ? "Disable" : "Enable"}
              </Button>
              <Button asChild size="sm" variant="primary">
                <Link href={withAsOf(`/rules/${id}/edit`, asOf)}>
                  <Pencil aria-hidden />
                  Edit
                </Link>
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={RULE_STATUS_TONE[status]}>{status}</Badge>
        <Badge tone="outline">{current.ruleType}</Badge>
        <span className="tabular font-mono text-sm text-ink">
          priority {current.priority}
        </span>
        <span className="tabular font-mono text-xs text-ink-subtle">
          v{current.version} &middot; from {formatDay(current.effectiveFrom)}
          {current.effectiveTo ? ` to ${formatDay(current.effectiveTo)}` : ""}
        </span>
      </div>

      {toggle.error ? <FormErrorBanner error={toggle.error} /> : null}
      {retire.error ? <FormErrorBanner error={retire.error} /> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="matching">Matching employees</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <section className="flex flex-col gap-3 rounded-md border border-border p-4">
              <h2 className="text-sm font-medium text-ink">Conditions</h2>

              {current.conditions.all.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  {current.ruleType === "MANUAL"
                    ? "This is a manual override. It targets one employee directly and has no conditions."
                    : "No conditions. This rule applies to every active employee."}
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {current.conditions.all.map((clause, index) => (
                    <li
                      key={`${clause.attribute}-${clause.op}-${index}`}
                      className="flex items-start gap-2 rounded-md border border-border p-2.5"
                    >
                      <span className="tabular mt-0.5 font-mono text-xs text-ink-subtle">
                        {index + 1}
                      </span>
                      <ConditionSentence clause={clause} groupName={groupName} />
                    </li>
                  ))}
                </ol>
              )}

              {current.conditions.all.length > 1 ? (
                <p className="text-xs text-ink-subtle">
                  All conditions must hold. Evaluation stops at the first one that fails.
                </p>
              ) : null}
            </section>

            {siblings.data ? (
              <PriorityImpact
                candidate={{
                  id: current.id,
                  name: current.name,
                  ruleType: current.ruleType,
                  priority: current.priority,
                }}
                siblings={siblings.data.items}
                cardinality={category?.cardinality}
                policyName={policyNameOf(current.policyId)}
              />
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </div>

          {canWrite ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-border p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-sm font-medium text-ink">Retire this rule</p>
                <p className="text-sm text-ink-muted">
                  Disables it and ends it today. Assignments it already produced keep their
                  history, and the next reconciliation removes the ones it was holding up.
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                loading={retire.isPending}
                onClick={() => retire.mutate()}
              >
                Retire
              </Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="matching">
          {matching.isPending ? (
            <SkeletonRows rows={6} />
          ) : matching.error ? (
            isApiError(matching.error) && matching.error.isRateLimited ? (
              <RateLimitNotice
                error={matching.error}
                what="population reads"
                onRetry={() => matching.refetch()}
              />
            ) : (
              <ErrorState error={matching.error} onRetry={() => matching.refetch()} />
            )
          ) : matching.data!.total === 0 ? (
            <EmptyState
              icon={Users}
              title="No active employee matches these conditions today."
              description="A rule that matches nobody is valid. It simply assigns nothing until someone qualifies."
            />
          ) : (
            <>
              <p className="tabular mb-2 text-xs text-ink-subtle">
                {matching.data!.total.toLocaleString()} matching employee
                {matching.data!.total === 1 ? "" : "s"}, showing{" "}
                {matching.data!.items.length}
              </p>

              <TableContainer>
                <Table>
                  <TableCaption>Employees this rule currently matches.</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Why they match</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matching.data!.items.map((match) => (
                      <TableRow key={match.employeeId}>
                        <TableCell>
                          <Link
                            href={withAsOf(`/employees/${match.employeeId}`, asOf)}
                            className="flex flex-col gap-0.5"
                          >
                            <span className="font-medium text-ink hover:underline">
                              {match.name}
                            </span>
                            <span className="text-xs text-ink-subtle">{match.email}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-ink-muted">{match.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <p className="mt-2 text-xs text-ink-subtle">
                Matching is not the same as receiving. Whether an employee ends up with the
                policy also depends on priority and on the cardinality of its category.
              </p>
            </>
          )}
        </TabsContent>

        <TabsContent value="history">
          {versions.isPending ? (
            <SkeletonRows rows={4} />
          ) : versions.error ? (
            <ErrorState error={versions.error} onRetry={() => versions.refetch()} />
          ) : (
            <TableContainer>
              <Table>
                <TableCaption>Every saved version of this rule.</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Version</TableHead>
                    <TableHead className="w-44">Saved</TableHead>
                    <TableHead className="w-40">By</TableHead>
                    <TableHead>What changed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...history].reverse().map((version) => (
                    <VersionRow
                      key={version.id}
                      version={version}
                      previous={history[history.indexOf(version) - 1]}
                      actorName={actorName}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <RuleDetail id={id} />
    </Suspense>
  )
}
