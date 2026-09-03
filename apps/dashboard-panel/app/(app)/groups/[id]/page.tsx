"use client"

import { Suspense, use, useEffect, useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Search, Trash2, UserPlus, Users } from "lucide-react"
import { DEFAULT_PAGE_SIZE } from "@policy/shared"
import { PageHeader } from "@/components/layout"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Field,
  FormErrorBanner,
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
import { formatDay, todayIso, useAsOf, withAsOf } from "@/lib/dates"
import { PERMISSIONS, useCan } from "@/lib/permissions"
import { listEmployees } from "@/features/employees/api"
import {
  addGroupMember,
  getGroup,
  listGroupMembers,
  removeGroupMember,
} from "@/features/groups/api"

/**
 * Group detail (design.md §29).
 *
 * Membership is effective-dated, so joining writes a row and leaving end-dates
 * one. Nothing is deleted, which is what lets a historical view of the group
 * still be correct.
 */

const AddMemberDialog = ({
  groupId,
  open,
  onOpenChange,
}: {
  groupId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso())

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 300)

    return () => window.clearTimeout(timer)
  }, [search])

  const candidates = useQuery({
    queryKey: queryKeys.employees({ search: debounced, status: "ACTIVE", picker: true }),
    queryFn: ({ signal }) =>
      listEmployees(
        { search: debounced || undefined, status: "ACTIVE" },
        { limit: DEFAULT_PAGE_SIZE, offset: 0 },
        signal,
      ),
    enabled: open,
    ...QUERY_TIERS.READ,
  })

  const add = useMutation({
    mutationFn: (employeeId: string) =>
      addGroupMember(groupId, { employeeId, effectiveFrom }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.group(groupId) })
      void queryClient.invalidateQueries({ queryKey: ["group", groupId, "members"] })
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add members</DialogTitle>
          <DialogDescription>
            Joining a group can change which policies apply. Reconciliation runs on its
            own once the membership is written.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Member from" id="member-from">
            <Input
              id="member-from"
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </Field>

          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employees"
              aria-label="Search employees"
              className="pl-8"
            />
          </div>

          {add.error ? <FormErrorBanner error={add.error} /> : null}

          <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
            {candidates.isPending ? (
              <li className="p-3">
                <SkeletonRows rows={4} />
              </li>
            ) : candidates.data!.items.length === 0 ? (
              <li className="p-3 text-sm text-ink-muted">No employees match.</li>
            ) : (
              candidates.data!.items.map((employee) => (
                <li
                  key={employee.id}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-ink">{employee.name}</span>
                    <span className="truncate text-xs text-ink-subtle">
                      {employee.department ?? "No department"}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={add.isPending && add.variables === employee.id}
                    onClick={() => add.mutate(employee.id)}
                  >
                    Add
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const GroupDetail = ({ id }: { id: string }) => {
  const { asOf, historical } = useAsOf()
  const queryClient = useQueryClient()
  const canWrite = useCan(PERMISSIONS.GROUP_WRITE)
  const [adding, setAdding] = useState(false)

  const group = useQuery({
    queryKey: queryKeys.group(id),
    queryFn: ({ signal }) => getGroup(id, signal),
    ...QUERY_TIERS.READ,
  })

  const members = useQuery({
    queryKey: queryKeys.groupMembers(id, asOf),
    queryFn: ({ signal }) => listGroupMembers(id, asOf, signal),
    ...QUERY_TIERS.READ,
  })

  const remove = useMutation({
    mutationFn: (employeeId: string) => removeGroupMember(id, employeeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["group", id, "members"] })
    },
  })

  if (group.isPending) return <SkeletonRows rows={6} />
  if (group.error) return <ErrorState error={group.error} onRetry={() => group.refetch()} />

  const current = group.data!

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={withAsOf("/groups", asOf)}>
          <ArrowLeft aria-hidden />
          Groups
        </Link>
      </Button>

      <PageHeader
        title={current.name}
        description={current.description ?? "Membership that assignment rules can match on."}
        actions={
          canWrite && !historical ? (
            <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
              <UserPlus aria-hidden />
              Add members
            </Button>
          ) : null
        }
      />

      {remove.error ? <FormErrorBanner error={remove.error} /> : null}

      {members.isPending ? (
        <SkeletonRows rows={6} />
      ) : members.error ? (
        <ErrorState error={members.error} onRetry={() => members.refetch()} />
      ) : members.data!.total === 0 ? (
        <EmptyState
          icon={Users}
          title="Nobody is a member on this date."
          description="A group with no members is valid. Rules matching on it simply match nobody."
          action={
            canWrite && !historical ? (
              <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
                Add members
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <p className="tabular mb-2 text-xs text-ink-subtle">
            {members.data!.total.toLocaleString()} member
            {members.data!.total === 1 ? "" : "s"}
          </p>

          <TableContainer>
            <Table>
              <TableCaption>Members of this group, effective-dated.</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden md:table-cell">Member since</TableHead>
                  {canWrite && !historical ? (
                    <TableHead className="w-24 text-right">Action</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data!.items.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Link
                        href={withAsOf(`/employees/${member.employeeId}`, asOf)}
                        className="flex flex-col gap-0.5"
                      >
                        <span className="font-medium text-ink hover:underline">
                          {member.employeeName}
                        </span>
                        <span className="text-xs text-ink-subtle">
                          {member.employeeEmail}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="tabular hidden md:table-cell text-ink-muted">
                      {formatDay(member.effectiveFrom)}
                    </TableCell>
                    {canWrite && !historical ? (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={
                            remove.isPending && remove.variables === member.employeeId
                          }
                          onClick={() => remove.mutate(member.employeeId)}
                        >
                          <Trash2 aria-hidden />
                          <span className="sr-only">
                            Remove {member.employeeName} from this group
                          </span>
                          Remove
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <p className="mt-2 text-xs text-ink-subtle">
            Removing someone end-dates their membership rather than deleting it, so a view
            of an earlier date still shows them as a member.
          </p>
        </>
      )}

      <AddMemberDialog groupId={id} open={adding} onOpenChange={setAdding} />
    </>
  )
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <GroupDetail id={id} />
    </Suspense>
  )
}
