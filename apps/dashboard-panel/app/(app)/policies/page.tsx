"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FileText, Plus, Search } from "lucide-react"
import { POLICY_STATUSES, type PolicyDTO, type PolicyStatus } from "@policy/shared"
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
} from "@/components/ui"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { useAsOf, withAsOf } from "@/lib/dates"
import { PERMISSIONS, useCan } from "@/lib/permissions"
import { useCategoryNames } from "@/features/reference/hooks"
import { createPolicy, listAllPolicies } from "@/features/policies/api"

/**
 * The policy catalogue (design.md §25 to §27).
 *
 * Grouped by category, because cardinality is a property of the category and it
 * is the single most consequential fact about a policy: whether it competes with
 * its siblings or sits alongside them.
 */

const STATUS_TONE: Record<PolicyStatus, "success" | "warning" | "neutral"> = {
  ACTIVE: "success",
  DRAFT: "warning",
  ARCHIVED: "neutral",
}

const NewPolicyDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const { categories } = useCategoryNames()

  const [name, setName] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [description, setDescription] = useState("")

  const create = useMutation({
    mutationFn: () =>
      createPolicy({
        name: name.trim(),
        categoryId,
        description: description.trim() === "" ? null : description.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["policies"] })
      onOpenChange(false)
      setName("")
      setDescription("")
    },
  })

  const ready = name.trim().length > 0 && categoryId !== ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New policy</DialogTitle>
          <DialogDescription>
            A policy is the thing an employee ends up holding. Rules decide who gets it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Name" id="policy-name">
            <Input
              id="policy-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Engineering Vacation"
            />
          </Field>

          <Field
            label="Category"
            id="policy-category"
            hint="Category cardinality decides whether an employee can hold more than one of these at once. It cannot be changed later."
          >
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="policy-category">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name} ({category.cardinality})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Description" id="policy-description" hint="Optional.">
            <Input
              id="policy-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          {create.error ? <FormErrorBanner error={create.error} /> : null}

          <p className="text-xs text-ink-subtle">
            New policies start as Draft. A draft policy is skipped by the engine, so
            nothing is assigned until you activate it.
          </p>
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
            Create policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const PolicyListView = () => {
  const router = useRouter()
  const params = useSearchParams()
  const { asOf } = useAsOf()
  const canWrite = useCan(PERMISSIONS.POLICY_WRITE)
  const { categories, get: categoryOf } = useCategoryNames()

  const [draft, setDraft] = useState(params.get("search") ?? "")
  const [creating, setCreating] = useState(false)

  const filters = {
    search: params.get("search") ?? undefined,
    categoryId: params.get("categoryId") ?? undefined,
    status: params.get("status") ?? undefined,
  }

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())

    if (value === null || value === "" || value === "ALL") next.delete(key)
    else next.set(key, value)

    const query = next.toString()
    router.replace(query ? `/policies?${query}` : "/policies", { scroll: false })
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft !== (params.get("search") ?? "")) setParam("search", draft || null)
    }, 300)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const query = useQuery({
    queryKey: queryKeys.policies({ ...filters }),
    queryFn: ({ signal }) => listAllPolicies(filters, { limit: 100, offset: 0 }, signal),
    ...QUERY_TIERS.READ,
  })

  const grouped = useMemo(() => {
    const byCategory = new Map<string, PolicyDTO[]>()

    for (const policy of query.data?.items ?? []) {
      const existing = byCategory.get(policy.categoryId)

      if (existing) existing.push(policy)
      else byCategory.set(policy.categoryId, [policy])
    }

    return Array.from(byCategory.entries()).sort(
      (a, b) =>
        (categoryOf(a[0])?.name ?? "").localeCompare(categoryOf(b[0])?.name ?? ""),
    )
  }, [query.data, categoryOf])

  return (
    <>
      <PageHeader
        title="Policies"
        description="What the organization can assign, grouped by the category that sets its cardinality."
        actions={
          canWrite ? (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New policy
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
            placeholder="Search policies"
            aria-label="Search policies"
            className="pl-8"
          />
        </div>

        <Select
          value={params.get("categoryId") ?? "ALL"}
          onValueChange={(value) => setParam("categoryId", value)}
        >
          <SelectTrigger aria-label="Filter by category" className="w-48">
            <SelectValue placeholder="Any category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any category</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={params.get("status") ?? "ALL"}
          onValueChange={(value) => setParam("status", value)}
        >
          <SelectTrigger aria-label="Filter by status" className="w-36">
            <SelectValue placeholder="Any status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any status</SelectItem>
            {POLICY_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isPending ? (
        <SkeletonRows rows={8} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No policies match these filters."
          description="Policies live inside a category. The category decides whether an employee can hold one of them or several."
          action={
            canWrite ? (
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                Create a policy
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([categoryId, policies]) => {
            const category = categoryOf(categoryId)

            return (
              <section
                key={categoryId}
                className="rounded-md border border-border bg-bg"
              >
                <header className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
                  <h2 className="text-sm font-medium text-ink">
                    {category?.name ?? "Unknown category"}
                  </h2>
                  {category ? (
                    <Badge tone={category.cardinality === "SINGLE" ? "info" : "outline"}>
                      {category.cardinality === "SINGLE"
                        ? "One per employee"
                        : "Several allowed"}
                    </Badge>
                  ) : null}
                  <span className="tabular ml-auto font-mono text-xs text-ink-subtle">
                    {policies.length}
                  </span>
                </header>

                <ul className="divide-y divide-border">
                  {policies.map((policy) => (
                    <li key={policy.id}>
                      <Link
                        href={withAsOf(`/policies/${policy.id}`, asOf)}
                        className="flex items-center gap-3 px-3 py-2.5 transition-colors duration-150 hover:bg-surface"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-sm font-medium text-ink">
                            {policy.name}
                          </span>
                          {policy.description ? (
                            <span className="truncate text-xs text-ink-subtle">
                              {policy.description}
                            </span>
                          ) : null}
                        </span>
                        <Badge tone={STATUS_TONE[policy.status]}>{policy.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <NewPolicyDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <PolicyListView />
    </Suspense>
  )
}
