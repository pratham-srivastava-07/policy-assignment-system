"use client"

import { Suspense, use, useMemo, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  ArrowLeft,
  Info,
  MoreHorizontal,
  RefreshCw,
  SlidersHorizontal,
  UserMinus,
} from "lucide-react"
import type { AssignmentDTO, Cardinality } from "@policy/shared"
import { PageHeader } from "@/components/layout"
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  ErrorState,
  Field,
  FormErrorBanner,
  Input,
  RateLimitNotice,
  Skeleton,
  SkeletonRows,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui"
import { DiffCounts, DiffRow, PolicyChip } from "@/components/policy"
import { ExplanationDrawer, NearMiss, type ExplanationTarget } from "@/components/explanation"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { formatDay, isZeroLengthPeriod, todayIso, useAsOf } from "@/lib/dates"
import { useGroupNames, usePolicyNames } from "@/features/reference/hooks"
import * as employeeApi from "@/features/employees/api"
import { getExplanation } from "@/features/reference/api"
import { PERMISSIONS, useCan } from "@/lib/permissions"
import { PreviewPanel } from "./preview-panel"

/**
 * The employee resolution view (design.md §13).
 *
 * The whole product in one screen: every policy that applies, what produced it,
 * and what almost did. Grouped by policy category rather than listed flat,
 * because cardinality is the thing that makes one group a contest and another a
 * collection, and a flat list hides that distinction entirely.
 */

const EmployeeDetail = ({ id }: { id: string }) => {
  const { asOf, historical } = useAsOf()
  const queryClient = useQueryClient()
  const canWrite = useCan(PERMISSIONS.EMPLOYEE_WRITE)
  const { nameOf: policyNameOf } = usePolicyNames()
  const { nameOf: groupName } = useGroupNames()

  const [explaining, setExplaining] = useState<ExplanationTarget | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [terminateOpen, setTerminateOpen] = useState(false)
  const [terminationDate, setTerminationDate] = useState(todayIso())

  const employee = useQuery({
    queryKey: queryKeys.employee(id),
    queryFn: ({ signal }) => employeeApi.getEmployee(id, signal),
    ...QUERY_TIERS.READ,
  })

  const assignments = useQuery({
    queryKey: queryKeys.employeeAssignments(id, asOf),
    queryFn: ({ signal }) => employeeApi.listEmployeeAssignments(id, asOf, signal),
    ...QUERY_TIERS.READ,
  })

  const groups = useQuery({
    queryKey: queryKeys.employeeGroups(id, asOf),
    queryFn: ({ signal }) => employeeApi.listEmployeeGroups(id, asOf, signal),
    ...QUERY_TIERS.READ,
  })

  const history = useQuery({
    queryKey: queryKeys.employeeAttributeHistory(id),
    queryFn: ({ signal }) => employeeApi.listAttributeHistory(id, signal),
    ...QUERY_TIERS.READ,
  })

  const rows = useMemo(() => assignments.data?.items ?? [], [assignments.data])

  /**
   * The near-miss trail rides on one assignment's explanation, which returns
   * every rule considered in that evaluation across all categories (§3.2c). No
   * extra request, and specifically no EXPENSIVE preview call per page load.
   */
  const trailSource = rows[0]?.id ?? null

  const trail = useQuery({
    queryKey: queryKeys.assignmentExplanation(trailSource ?? "none"),
    queryFn: ({ signal }) => getExplanation(trailSource!, signal),
    enabled: trailSource !== null,
    ...QUERY_TIERS.READ,
  })

  const reconcile = useMutation({
    mutationFn: () => employeeApi.reconcileEmployee(id, asOf),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.employee(id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.reconciliationStatus() })
    },
  })

  const terminate = useMutation({
    mutationFn: () =>
      employeeApi.terminateEmployee(id, { terminatedOn: terminationDate }),
    onSuccess: async () => {
      setTerminateOpen(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employee", id] }),
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
        queryClient.invalidateQueries({ queryKey: ["reconciliation", "status"] }),
      ])
    },
  })

  const byCategory = useMemo(() => {
    const groupsByCategory = new Map<
      string,
      { name: string; cardinality: Cardinality; items: AssignmentDTO[] }
    >()

    for (const assignment of rows) {
      // §8.4: a reconcile can close and reopen on the same day, leaving a real
      // but empty [d, d) interval. Rendering it produces a ladder of same-day
      // rows that look like duplicates.
      if (isZeroLengthPeriod(assignment)) continue

      const existing = groupsByCategory.get(assignment.categoryId)

      if (existing) existing.items.push(assignment)
      else
        groupsByCategory.set(assignment.categoryId, {
          name: assignment.categoryName,
          cardinality: assignment.cardinality,
          items: [assignment],
        })
    }

    return Array.from(groupsByCategory.entries()).sort((a, b) =>
      a[1].name.localeCompare(b[1].name),
    )
  }, [rows])

  if (employee.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <SkeletonRows rows={8} />
      </div>
    )
  }

  if (employee.error) {
    return <ErrorState error={employee.error} onRetry={() => employee.refetch()} />
  }

  const person = employee.data!
  const firstName = person.name.split(" ")[0] ?? person.name
  const terminated = person.status === "TERMINATED"

  return (
    <>
      <Link
        href="/employees"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Employees
      </Link>

      <PageHeader
        title={person.name}
        description={[
          person.department,
          person.role,
          person.employmentType,
          person.state ?? person.location,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          terminated || historical ? undefined : (
            <>
              <Button size="sm" variant="secondary" onClick={() => setPreviewOpen(true)}>
                <SlidersHorizontal aria-hidden />
                Preview a change
              </Button>
              <Button
                size="sm"
                loading={reconcile.isPending}
                onClick={() => reconcile.mutate()}
              >
                <RefreshCw aria-hidden />
                Reconcile now
              </Button>
              {canWrite ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" aria-label="Employee actions">
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      className="text-status-danger"
                      onSelect={() => {
                        terminate.reset()
                        setTerminationDate(todayIso())
                        setTerminateOpen(true)
                      }}
                    >
                      <UserMinus aria-hidden />
                      Terminate employee
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </>
          )
        }
      />

      {terminated ? (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-status-neutral-bg px-3 py-2 text-sm text-status-neutral">
          <Info className="size-4 shrink-0" aria-hidden />
          Terminated {person.terminatedOn ? formatDay(person.terminatedOn) : ""}. Policy
          history stays readable; reconciliation is refused for terminated employees.
        </div>
      ) : null}

      {/* §8.3: `GET /employees/:id` has no asOf, so the header above is always
          today's attributes. Saying so is the difference between a historical
          view and a misleading one. */}
      {historical ? (
        <div className="mb-4 flex items-start gap-2 rounded-md bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Showing current attributes. The policies below are as of {formatDay(asOf!)}. See
            Attributes for the values that were true on that date.
          </span>
        </div>
      ) : null}

      {reconcile.error ? (
        <RateLimitNotice
          error={reconcile.error}
          what="reconciliations"
          className="mb-4"
          onRetry={() => reconcile.mutate()}
        />
      ) : null}

      {reconcile.data ? (
        <div className="mb-4 rounded-md border border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-medium text-ink">Reconciled</span>
            <DiffCounts
              added={reconcile.data.added.length}
              removed={reconcile.data.removed.length}
              unchanged={reconcile.data.unchanged.length}
            />
          </div>
          <div className="flex flex-col">
            {reconcile.data.added.map((assignment) => (
              <DiffRow key={`a-${assignment.id}`} kind="added" highlight>
                <PolicyChip
                  policyName={assignment.policyName}
                  categoryName={assignment.categoryName}
                  cardinality={assignment.cardinality}
                  sourceRuleName={assignment.sourceRuleName}
                  tone="added"
                />
              </DiffRow>
            ))}
            {reconcile.data.removed.map((assignment) => (
              <DiffRow key={`r-${assignment.id}`} kind="removed" highlight>
                <PolicyChip
                  policyName={assignment.policyName}
                  categoryName={assignment.categoryName}
                  cardinality={assignment.cardinality}
                  sourceRuleName={assignment.sourceRuleName}
                  tone="removed"
                />
              </DiffRow>
            ))}
            {reconcile.data.added.length + reconcile.data.removed.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Already correct. Nothing was added or removed.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <Tabs defaultValue="policies">
        <TabsList>
          <TabsTrigger value="policies">Policies</TabsTrigger>
          <TabsTrigger value="attributes">Attributes</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="flex flex-col gap-4">
          {assignments.isPending ? (
            <SkeletonRows rows={6} />
          ) : assignments.error ? (
            <ErrorState error={assignments.error} onRetry={() => assignments.refetch()} />
          ) : byCategory.length === 0 ? (
            <EmptyState
              title={`No policies apply to ${firstName} on this date.`}
              description={
                person.hireDate > (asOf ?? new Date().toISOString().slice(0, 10))
                  ? `${firstName} was not employed then. Hired ${formatDay(person.hireDate)}.`
                  : undefined
              }
              action={
                terminated || historical ? undefined : (
                  <Button size="sm" onClick={() => reconcile.mutate()}>
                    Reconcile now
                  </Button>
                )
              }
            />
          ) : (
            <>
              <p className="tabular text-xs text-ink-subtle">
                {rows.length} assigned as of {formatDay(asOf ?? person.updatedAt.slice(0, 10))}
              </p>

              {byCategory.map(([categoryId, category]) => (
                <section key={categoryId} className="rounded-md border border-border">
                  <header className="flex flex-wrap items-baseline gap-2 border-b border-border bg-surface px-3 py-2">
                    <h2 className="text-sm font-medium text-ink">{category.name}</h2>
                    <Badge tone={category.cardinality === "SINGLE" ? "info" : "neutral"}>
                      {category.cardinality}
                    </Badge>
                    <span className="ml-auto text-xs text-ink-subtle">
                      {/* §27.2: the ordering means different things per cardinality,
                          and a MULTIPLE category must never read as a ladder. */}
                      {category.cardinality === "SINGLE"
                        ? "Highest-priority matching rule wins."
                        : "Rules do not compete; each matching rule assigns independently."}
                    </span>
                  </header>

                  <div className="flex flex-col gap-1.5 p-2">
                    {category.items.map((assignment) => (
                      <PolicyChip
                        key={assignment.id}
                        policyName={assignment.policyName}
                        sourceRuleName={assignment.sourceRuleName}
                        sourceRuleVersion={assignment.sourceRuleVersion}
                        resolutionStatus={assignment.resolutionStatus}
                        effectiveFrom={assignment.effectiveFrom}
                        effectiveTo={assignment.effectiveTo}
                        onExplain={() =>
                          setExplaining({ assignment, subject: firstName })
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}

              {trail.data ? (
                <NearMiss
                  entries={trail.data.trail}
                  subject={firstName}
                  policyNameOf={policyNameOf}
                  groupName={groupName}
                />
              ) : null}
            </>
          )}
        </TabsContent>

        <TabsContent value="attributes">
          {history.isPending ? (
            <SkeletonRows rows={6} />
          ) : (
            <div className="flex flex-col gap-1 rounded-md border border-border p-3">
              <p className="mb-2 text-xs text-ink-subtle">
                Current values, and every recorded change. This is the historical source
                for what was true on a past date.
              </p>
              {(history.data?.items ?? []).length === 0 ? (
                <p className="text-sm text-ink-muted">No attribute changes recorded.</p>
              ) : (
                (history.data?.items ?? [])
                  .filter((entry) => !isZeroLengthPeriod(entry))
                  .map((entry) => (
                    <DiffRow key={entry.id} kind="changed">
                      <span className="text-sm text-ink">
                        <span className="text-ink-muted">{entry.attribute}</span>{" "}
                        {entry.oldValue ?? "not set"}{" "}
                        <span className="text-ink-subtle">to</span>{" "}
                        <span className="font-medium">{entry.newValue ?? "not set"}</span>
                      </span>
                      <span className="tabular">
                        Effective {formatDay(entry.effectiveFrom)}
                      </span>
                    </DiffRow>
                  ))
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="groups">
          {groups.isPending ? (
            <SkeletonRows rows={4} />
          ) : (groups.data ?? []).length === 0 ? (
            <EmptyState title={`${firstName} is not in any group on this date.`} />
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-md border border-border">
              {(groups.data ?? []).map((membership) => {
                const ended =
                  membership.effectiveTo !== null &&
                  membership.effectiveTo <= (asOf ?? new Date().toISOString().slice(0, 10))

                return (
                  <div
                    key={membership.id}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span
                      className={
                        ended ? "text-sm text-ink-subtle" : "text-sm font-medium text-ink"
                      }
                    >
                      {membership.groupName}
                    </span>
                    <span className="tabular text-xs text-ink-subtle">
                      Joined {formatDay(membership.effectiveFrom)}
                      {membership.effectiveTo
                        ? ` · ended ${formatDay(membership.effectiveTo)}`
                        : ""}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ExplanationDrawer target={explaining} onClose={() => setExplaining(null)} />

      {previewOpen ? (
        <PreviewPanel
          employee={person}
          asOf={asOf}
          onClose={() => setPreviewOpen(false)}
        />
      ) : null}

      <Dialog open={terminateOpen} onOpenChange={setTerminateOpen}>
        <DialogContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              if (terminationDate) terminate.mutate()
            }}
          >
            <DialogHeader>
              <DialogTitle>Terminate {person.name}?</DialogTitle>
              <DialogDescription>
                This ends employment without deleting the employee or their history.
              </DialogDescription>
            </DialogHeader>

            <Field
              id="termination-date"
              label="Effective termination date"
              hint="Open policy assignments and group memberships close on this date."
            >
              <Input
                id="termination-date"
                type="date"
                required
                value={terminationDate}
                onChange={(event) => setTerminationDate(event.target.value)}
              />
            </Field>

            <div className="rounded-md bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
              {person.name} will be marked terminated immediately and excluded from
              future rule evaluation. Existing policy, membership and audit history
              remains readable.
            </div>

            {terminate.error ? <FormErrorBanner error={terminate.error} /> : null}

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setTerminateOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={terminate.isPending}
                disabled={!terminationDate}
              >
                Terminate employee
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  return (
    <Suspense fallback={<SkeletonRows rows={10} />}>
      <EmployeeDetail id={id} />
    </Suspense>
  )
}
