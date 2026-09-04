"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { Plus, Search, Users, X } from "lucide-react"
import { DEFAULT_PAGE_SIZE } from "@policy/shared"
import { PageHeader } from "@/components/layout"
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  SkeletonRows,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { useAsOf, withAsOf } from "@/lib/dates"
import { listEmployees, type EmployeeFilters } from "@/features/employees/api"
import { PERMISSIONS, useCan } from "@/lib/permissions"

/**
 * The employee list (design.md §11).
 *
 * No sortable headers and no row selection, because the API has no `sort`
 * parameter and no bulk endpoints. A control that promises something the backend
 * cannot do is worse than its absence.
 */

const FILTER_KEYS = ["search", "department", "state", "role", "employmentType", "status"] as const

const EmployeeListView = () => {
  const router = useRouter()
  const params = useSearchParams()
  const { asOf } = useAsOf()
  const canWrite = useCan(PERMISSIONS.EMPLOYEE_WRITE)

  const page = Number(params.get("page") ?? "1")
  // §11.3: the API does not filter to ACTIVE by default. The client asks for it
  // and shows the ask as a removable chip, so the default is discoverable.
  const statusParam = params.get("status")
  const status = statusParam === "ALL" ? undefined : (statusParam ?? "ACTIVE")
  const [draft, setDraft] = useState(params.get("search") ?? "")

  const filters: EmployeeFilters = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, key === "status" ? status : (params.get(key) ?? undefined)]).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  )

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())

    if (value === null || value === "") next.delete(key)
    else next.set(key, value)

    if (key !== "page") next.delete("page")

    const query = next.toString()
    router.replace(query ? `/employees?${query}` : "/employees", { scroll: false })
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft !== (params.get("search") ?? "")) setParam("search", draft || null)
    }, 300)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const query = useQuery({
    queryKey: queryKeys.employees({ ...filters, page }),
    queryFn: ({ signal }) =>
      listEmployees(
        filters,
        { limit: DEFAULT_PAGE_SIZE, offset: (page - 1) * DEFAULT_PAGE_SIZE },
        signal,
      ),
    ...QUERY_TIERS.READ,
  })

  const total = query.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE))
  const activeChips = Array.from(
    Object.entries(filters).filter(([key]) => key !== "search"),
  ) as [string, string][]

  // The normal list intentionally defaults to ACTIVE. When it is empty, this
  // one-row read distinguishes a new organization from one whose filters merely
  // hide terminated employees, so the empty-state action stays truthful.
  const allEmployees = useQuery({
    queryKey: queryKeys.employees({ purpose: "empty-state-check" }),
    queryFn: ({ signal }) => listEmployees({}, { limit: 1, offset: 0 }, signal),
    enabled: query.isSuccess && total === 0,
    ...QUERY_TIERS.REFERENCE,
  })

  const trulyEmpty = allEmployees.data?.total === 0

  return (
    <>
      <PageHeader
        title="Employees"
        description="Every policy assignment in the organization is reached from here."
        actions={
          canWrite ? (
            <Button asChild size="sm" variant="primary">
              <Link href="/employees/new">
                <Plus aria-hidden />
                Add employee
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search employees"
            aria-label="Search employees"
            className="pl-8"
          />
        </div>

        {activeChips.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {activeChips.map(([key, value]) => (
              <button
                key={key}
                type="button"
                onClick={() => setParam(key, key === "status" ? "ALL" : null)}
                className="inline-flex h-6 items-center gap-1 rounded-sm border border-border px-1.5 text-xs text-ink-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
              >
                {key}: {value}
                <X className="size-3" aria-hidden />
                <span className="sr-only">Remove filter</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {query.isPending ? (
        <SkeletonRows rows={10} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : total === 0 && allEmployees.isPending ? (
        <div aria-live="polite" aria-label="Checking for employees">
          <SkeletonRows rows={3} />
        </div>
      ) : total === 0 && allEmployees.error ? (
        <ErrorState error={allEmployees.error} onRetry={() => allEmployees.refetch()} />
      ) : total === 0 && trulyEmpty ? (
        <EmptyState
          icon={Users}
          title="No employees yet."
          description="Add the first employee so assignment rules have someone to evaluate."
          action={
            canWrite ? (
              <Button asChild size="sm" variant="primary">
                <Link href="/employees/new">Add employee</Link>
              </Button>
            ) : undefined
          }
        />
      ) : total === 0 ? (
        <EmptyState
          icon={Users}
          title="No employees match these filters."
          action={
            <Button size="sm" onClick={() => router.replace("/employees?status=ALL")}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <p className="tabular mb-2 text-xs text-ink-subtle">
            {total.toLocaleString()} employee{total === 1 ? "" : "s"}
          </p>

          <TableContainer>
            <Table>
              <TableCaption>Employees, with the attributes rules match on.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden md:table-cell">Department</TableHead>
                  <TableHead className="hidden lg:table-cell">Role</TableHead>
                  <TableHead className="hidden md:table-cell">Location</TableHead>
                  <TableHead className="hidden lg:table-cell">Type</TableHead>
                  <TableHead className="text-right">Tenure</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data!.items.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>
                      <Link
                        href={withAsOf(`/employees/${employee.id}`, asOf)}
                        className="flex flex-col gap-0.5"
                      >
                        <span className="font-medium text-ink hover:underline">
                          {employee.name}
                        </span>
                        <span className="text-xs text-ink-subtle">{employee.email}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-ink-muted">
                      {employee.department ?? "-"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-ink-muted">
                      {employee.role ?? "-"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-ink-muted">
                      {employee.state ?? employee.location ?? "-"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="text-xs text-ink-muted">{employee.employmentType}</span>
                    </TableCell>
                    <TableCell className="tabular text-right text-ink-muted">
                      {employee.status === "TERMINATED" ? (
                        <Badge tone="neutral">Terminated</Badge>
                      ) : (
                        `${employee.tenureDays.toLocaleString()}d`
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {pages > 1 ? (
            <div className="mt-3 flex items-center justify-between">
              <span className="tabular text-xs text-ink-subtle">
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setParam("page", String(page - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= pages}
                  onClick={() => setParam("page", String(page + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={10} />}>
      <EmployeeListView />
    </Suspense>
  )
}
