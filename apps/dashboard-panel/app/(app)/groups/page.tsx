"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Layers, Plus, Search } from "lucide-react"
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
} from "@/components/ui"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { formatDay, useAsOf, withAsOf } from "@/lib/dates"
import { PERMISSIONS, useCan } from "@/lib/permissions"
import { createGroup, listAllGroups } from "@/features/groups/api"

/**
 * Groups (design.md §29).
 *
 * Membership that a GROUP rule can match on. Deliberately thin: a group has a
 * name and a set of effective-dated memberships, and everything interesting
 * about it happens in the rule that references it.
 */

const NewGroupDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const create = useMutation({
    mutationFn: () =>
      createGroup({
        name: name.trim(),
        description: description.trim() === "" ? null : description.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["groups"] })
      onOpenChange(false)
      setName("")
      setDescription("")
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>
            Groups exist so a rule can say &ldquo;is in this group&rdquo; instead of
            restating a list of attributes.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Name" id="group-name">
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Leadership"
            />
          </Field>

          <Field label="Description" id="group-description" hint="Optional.">
            <Input
              id="group-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          {create.error ? <FormErrorBanner error={create.error} /> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={name.trim().length === 0}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const GroupListView = () => {
  const router = useRouter()
  const params = useSearchParams()
  const { asOf } = useAsOf()
  const canWrite = useCan(PERMISSIONS.GROUP_WRITE)

  const [draft, setDraft] = useState(params.get("search") ?? "")
  const [creating, setCreating] = useState(false)

  const search = params.get("search") ?? undefined

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft === (params.get("search") ?? "")) return

      const next = new URLSearchParams(params.toString())

      if (draft) next.set("search", draft)
      else next.delete("search")

      const query = next.toString()
      router.replace(query ? `/groups?${query}` : "/groups", { scroll: false })
    }, 300)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const query = useQuery({
    queryKey: queryKeys.groups({ search }),
    queryFn: ({ signal }) => listAllGroups({ search }, { limit: 100, offset: 0 }, signal),
    ...QUERY_TIERS.READ,
  })

  return (
    <>
      <PageHeader
        title="Groups"
        description="Membership that assignment rules can match on."
        actions={
          canWrite ? (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New group
            </Button>
          ) : null
        }
      />

      <div className="relative mb-4 max-w-md">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
          aria-hidden
        />
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Search groups"
          aria-label="Search groups"
          className="pl-8"
        />
      </div>

      {query.isPending ? (
        <SkeletonRows rows={6} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data!.items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No groups yet."
          description="A group is a named set of employees a rule can match on, useful when the membership is a decision rather than an attribute."
          action={
            canWrite ? (
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                Create a group
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-bg">
          {query.data!.items.map((group) => (
            <li key={group.id}>
              <Link
                href={withAsOf(`/groups/${group.id}`, asOf)}
                className="flex items-center gap-3 px-3 py-3 transition-colors duration-150 hover:bg-surface"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium text-ink">{group.name}</span>
                  {group.description ? (
                    <span className="truncate text-xs text-ink-subtle">
                      {group.description}
                    </span>
                  ) : null}
                </span>
                <span className="tabular shrink-0 font-mono text-xs text-ink-subtle">
                  since {formatDay(group.createdAt.slice(0, 10))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <NewGroupDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <GroupListView />
    </Suspense>
  )
}
