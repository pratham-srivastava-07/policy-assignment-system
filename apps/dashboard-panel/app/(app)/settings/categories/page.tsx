"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Layers, Plus } from "lucide-react"
import { CARDINALITIES, type Cardinality } from "@policy/shared"
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
  Field,
  FormErrorBanner,
  Input,
  RadioGroup,
  RadioGroupItem,
  SkeletonRows,
} from "@/components/ui"
import { useCategories } from "@/features/reference/hooks"
import { createCategory } from "@/features/policies/api"
import { PERMISSIONS, useCan } from "@/lib/permissions"

/**
 * Policy categories (design.md §46.1).
 *
 * The one setting with real consequences. Cardinality is chosen once and never
 * changed: moving a category from MULTIPLE to SINGLE would invalidate
 * assignments that already exist, so the server refuses to patch it and this
 * form says so at the moment the choice is made rather than after.
 */

const CARDINALITY_HELP: Record<Cardinality, string> = {
  SINGLE:
    "An employee can hold one policy from this category. When several rules match, the highest priority wins and the rest are recorded as losers.",
  MULTIPLE:
    "An employee can hold several policies from this category at once. Rules do not displace each other.",
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "")

const NewCategoryDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const [name, setName] = useState("")
  const [key, setKey] = useState("")
  const [cardinality, setCardinality] = useState<Cardinality>("SINGLE")
  const [keyTouched, setKeyTouched] = useState(false)

  const create = useMutation({
    mutationFn: () =>
      createCategory({ name: name.trim(), key: key.trim(), cardinality }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["policy-categories"] })
      onOpenChange(false)
      setName("")
      setKey("")
      setKeyTouched(false)
    },
  })

  const setNameAndKey = (value: string) => {
    setName(value)
    if (!keyTouched) setKey(slugify(value))
  }

  const keyValid = /^[a-z][a-z0-9_]*$/.test(key)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New policy category</DialogTitle>
          <DialogDescription>
            A category groups policies and fixes how many of them one employee can hold.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field label="Name" id="category-name">
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setNameAndKey(event.target.value)}
              placeholder="Pay Schedule"
            />
          </Field>

          <Field
            label="Key"
            id="category-key"
            hint="Lowercase letters, digits and underscores. Used by rules and integrations, so it does not change."
            error={key !== "" && !keyValid ? "Keys start with a letter and use only lowercase letters, digits and underscores." : undefined}
          >
            <Input
              id="category-key"
              value={key}
              className="font-mono"
              onChange={(event) => {
                setKeyTouched(true)
                setKey(event.target.value)
              }}
            />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-ink">Cardinality</legend>
            <RadioGroup
              value={cardinality}
              onValueChange={(value) => setCardinality(value as Cardinality)}
              className="flex flex-col gap-2"
            >
              {CARDINALITIES.map((option) => (
                <label
                  key={option}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2.5 has-[button[data-state=checked]]:border-accent has-[button[data-state=checked]]:bg-accent-soft"
                >
                  <RadioGroupItem value={option} className="mt-0.5" />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-ink">
                      {option === "SINGLE" ? "One per employee" : "Several allowed"}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {CARDINALITY_HELP[option]}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            <p className="text-xs text-status-warning">
              Cardinality cannot be changed once the category exists.
            </p>
          </fieldset>

          {create.error ? <FormErrorBanner error={create.error} /> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={name.trim() === "" || !keyValid}
            loading={create.isPending}
            onClick={() => create.mutate()}
          >
            Create category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function Page() {
  const categories = useCategories()
  const canWrite = useCan(PERMISSIONS.POLICY_WRITE)
  const [creating, setCreating] = useState(false)

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/settings">
          <ArrowLeft aria-hidden />
          Settings
        </Link>
      </Button>

      <PageHeader
        title="Policy categories"
        description="The groupings policies live in, and the cardinality that decides whether they compete."
        actions={
          canWrite ? (
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New category
            </Button>
          ) : null
        }
      />

      {categories.isPending ? (
        <SkeletonRows rows={5} />
      ) : (categories.data?.items.length ?? 0) === 0 ? (
        <EmptyState
          icon={Layers}
          title="No categories yet."
          description="Policies cannot exist without one, because the category is what fixes their cardinality."
          action={
            canWrite ? (
              <Button size="sm" variant="primary" onClick={() => setCreating(true)}>
                Create a category
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="flex max-w-2xl flex-col divide-y divide-border rounded-md border border-border bg-bg">
          {categories.data!.items.map((category) => (
            <li key={category.id} className="flex items-center gap-3 px-3 py-3">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-ink">{category.name}</span>
                <span className="font-mono text-xs text-ink-subtle">{category.key}</span>
              </span>
              <Badge tone={category.cardinality === "SINGLE" ? "info" : "outline"}>
                {category.cardinality === "SINGLE"
                  ? "One per employee"
                  : "Several allowed"}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <NewCategoryDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}
