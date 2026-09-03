"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Plus, UserCog } from "lucide-react"
import { DEFAULT_PAGE_SIZE, ORGANIZATION_ROLES, type OrganizationRole } from "@policy/shared"
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
  EmptyState,
  ErrorState,
  Field,
  FormErrorBanner,
  Input,
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
} from "@/components/ui"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { formatDayTime } from "@/lib/dates"
import { useSession } from "@/lib/auth"
import { PERMISSIONS, ROLE_LABELS, useCan } from "@/lib/permissions"
import { createTeammate, listTeammates, removeTeammate } from "@/features/settings/api"

/**
 * Teammates (design.md §46.3).
 *
 * Roles are set at invitation and are not patchable afterwards, so the table
 * shows the role as a fact rather than a control. Changing someone's role is a
 * server-side operation this API does not expose, and a select that silently
 * fails would be worse than its absence.
 */

const ROLE_HELP: Record<OrganizationRole, string> = {
  COMPANY_ADMIN: "Full access, including organization settings and teammates.",
  HR_ADMIN: "Manages employees, rules, policies and groups.",
  MANAGER: "Reads their own reporting line.",
  EMPLOYEE: "Reads their own record only.",
}

const InviteDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<OrganizationRole>("HR_ADMIN")

  const create = useMutation({
    mutationFn: () =>
      createTeammate({ name: name.trim(), email: email.trim(), password, role }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] })
      onOpenChange(false)
      setName("")
      setEmail("")
      setPassword("")
    },
  })

  const ready = name.trim() !== "" && email.trim() !== "" && password.length >= 8

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a teammate</DialogTitle>
          <DialogDescription>
            Creates a login in this organization. Roles are fixed at creation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Name" id="teammate-name">
            <Input
              id="teammate-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>

          <Field label="Email" id="teammate-email">
            <Input
              id="teammate-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field
            label="Temporary password"
            id="teammate-password"
            hint="At least 8 characters. Share it with them directly; it is shown only here."
          >
            <Input
              id="teammate-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Field label="Role" id="teammate-role" hint={ROLE_HELP[role]}>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as OrganizationRole)}
            >
              <SelectTrigger id="teammate-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORGANIZATION_ROLES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ROLE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {create.error ? <FormErrorBanner error={create.error} /> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Add teammate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Page() {
  const queryClient = useQueryClient()
  const { session } = useSession()
  const canWrite = useCan(PERMISSIONS.MEMBER_WRITE)
  const [inviting, setInviting] = useState(false)

  const users = useQuery({
    queryKey: queryKeys.users({ limit: DEFAULT_PAGE_SIZE }),
    queryFn: ({ signal }) =>
      listTeammates({ limit: DEFAULT_PAGE_SIZE, offset: 0 }, signal),
    ...QUERY_TIERS.READ,
  })

  const remove = useMutation({
    mutationFn: (id: string) => removeTeammate(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] })
    },
  })

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/settings">
          <ArrowLeft aria-hidden />
          Settings
        </Link>
      </Button>

      <PageHeader
        title="Teammates"
        description="Who can sign in to this workspace."
        actions={
          canWrite ? (
            <Button variant="primary" size="sm" onClick={() => setInviting(true)}>
              <Plus aria-hidden />
              Add teammate
            </Button>
          ) : null
        }
      />

      {remove.error ? <FormErrorBanner error={remove.error} /> : null}

      {users.isPending ? (
        <SkeletonRows rows={5} />
      ) : users.error ? (
        <ErrorState error={users.error} onRetry={() => users.refetch()} />
      ) : users.data!.items.length === 0 ? (
        <EmptyState icon={UserCog} title="No teammates yet." />
      ) : (
        <TableContainer>
          <Table>
            <TableCaption>People with a login in this organization.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead className="hidden lg:table-cell">Linked employee</TableHead>
                <TableHead className="hidden w-44 md:table-cell">Added</TableHead>
                {canWrite ? <TableHead className="w-24 text-right">Action</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data!.items.map((user) => {
                const isSelf = user.id === session?.user.id

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <span className="flex flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-ink">{user.name}</span>
                          {isSelf ? <Badge tone="info">You</Badge> : null}
                        </span>
                        <span className="text-xs text-ink-subtle">{user.email}</span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {user.employeeId ? (
                        <Link
                          href={`/employees/${user.employeeId}`}
                          className="text-ink-muted hover:underline"
                        >
                          View employee record
                        </Link>
                      ) : (
                        <span className="text-ink-subtle">Not linked</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular hidden text-xs text-ink-muted md:table-cell">
                      {formatDayTime(user.createdAt)}
                    </TableCell>
                    {canWrite ? (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isSelf}
                          loading={remove.isPending && remove.variables === user.id}
                          onClick={() => remove.mutate(user.id)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <p className="mt-2 text-xs text-ink-subtle">
        A teammate role is set when the login is created and is not editable here.
      </p>

      <InviteDialog open={inviting} onOpenChange={setInviting} />
    </>
  )
}
