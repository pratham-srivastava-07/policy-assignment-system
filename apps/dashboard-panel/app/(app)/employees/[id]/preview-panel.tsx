"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Info } from "lucide-react"
import type { EmployeeDTO, PreviewDTO } from "@policy/shared"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FormErrorBanner,
  Input,
  RateLimitNotice,
} from "@/components/ui"
import { DiffRow, PolicyChip } from "@/components/policy"
import { queryKeys } from "@/lib/query"
import { isApiError } from "@/lib/api"
import type { AsOf } from "@/lib/dates"
import * as employeeApi from "@/features/employees/api"
import { useReconciliationStatus } from "@/features/reference/hooks"

/**
 * Preview before save (design.md §16).
 *
 * The server is authoritative: the browser never guesses what a change would do.
 * Save stays disabled until a preview has run, because an attribute edit whose
 * downstream consequences were never shown is exactly the surprise this product
 * exists to prevent.
 */

const EDITABLE = [
  { key: "department", label: "Department" },
  { key: "role", label: "Role" },
  { key: "state", label: "State" },
  { key: "location", label: "Location" },
  { key: "employmentType", label: "Employment type" },
] as const

export const PreviewPanel = ({
  employee,
  asOf,
  onClose,
}: {
  employee: EmployeeDTO
  asOf: AsOf
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const { data: backlog } = useReconciliationStatus()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [result, setResult] = useState<PreviewDTO | null>(null)

  const changes = Object.fromEntries(
    Object.entries(draft).filter(
      ([key, value]) =>
        value.trim().length > 0 &&
        value !== ((employee as unknown as Record<string, string | null>)[key] ?? ""),
    ),
  )

  const dirty = Object.keys(changes).length > 0

  const preview = useMutation({
    mutationFn: () => employeeApi.previewEmployee(employee.id, changes, asOf),
    onSuccess: setResult,
  })

  const save = useMutation({
    mutationFn: () => employeeApi.patchEmployee(employee.id, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.employee(employee.id) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.reconciliationStatus() })
      onClose()
    },
  })

  const pendingBacklog = (backlog?.counts.PENDING ?? 0) + (backlog?.counts.PROCESSING ?? 0)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview a change to {employee.name}</DialogTitle>
          <DialogDescription>
            Change an attribute and see which policies would move before anything is
            saved.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          {EDITABLE.map((field) => {
            const current =
              (employee as unknown as Record<string, string | null>)[field.key] ?? ""

            return (
              <Field
                key={field.key}
                id={`preview-${field.key}`}
                label={field.label}
                hint={current ? `was ${current}` : "not set"}
              >
                <Input
                  id={`preview-${field.key}`}
                  value={draft[field.key] ?? current}
                  onChange={(event) => {
                    setResult(null)
                    setDraft((state) => ({ ...state, [field.key]: event.target.value }))
                  }}
                />
              </Field>
            )
          })}
        </div>

        {/* §16.2: the preview endpoint has no managerId input, so a manager
            change produces no diff. Saying so beats an empty diff that implies
            nothing would change. */}
        <p className="flex items-start gap-1.5 text-xs text-ink-subtle">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Manager changes are not included in this preview.
        </p>

        {preview.error ? (
          isApiError(preview.error) && preview.error.isRateLimited ? (
            <RateLimitNotice
              error={preview.error}
              what="previews"
              onRetry={() => preview.mutate()}
            />
          ) : (
            <FormErrorBanner error={preview.error} />
          )
        ) : null}

        {save.error ? <FormErrorBanner error={save.error} /> : null}

        {result ? (
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-xs font-medium text-ink-muted">
              Preview. Nothing has been saved.
            </p>

            <div className="flex flex-col">
              {result.added.map((policy) => (
                <DiffRow key={`a-${policy.policyId}`} kind="added">
                  <PolicyChip
                    policyName={policy.policyName}
                    sourceRuleName={policy.ruleName}
                    tone="added"
                  />
                </DiffRow>
              ))}
              {result.removed.map((policy) => (
                <DiffRow key={`r-${policy.policyId}`} kind="removed">
                  <PolicyChip
                    policyName={policy.policyName}
                    sourceRuleName={policy.ruleName}
                    tone="removed"
                  />
                </DiffRow>
              ))}
              {result.added.length + result.removed.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  No policies would change. {result.unchanged.length} stay as they are.
                </p>
              ) : (
                <p className="mt-1 text-xs text-ink-subtle">
                  {result.unchanged.length} unchanged.
                </p>
              )}
            </div>

            {/* §16.3: preview compares the engine now against the engine with the
                change. If the employee is behind, that baseline can disagree with
                what the Policies tab shows. */}
            {pendingBacklog > 0 ? (
              <p className="mt-2 text-xs text-status-warning">
                {pendingBacklog} change{pendingBacklog === 1 ? " is" : "s are"} still being
                applied. This preview reflects the rules as they stand now, which may
                differ from the policies listed on the page.
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            disabled={!dirty}
            loading={preview.isPending}
            onClick={() => preview.mutate()}
          >
            Preview change
          </Button>
          <Button
            variant="primary"
            disabled={!dirty || result === null}
            loading={save.isPending}
            onClick={() => save.mutate()}
          >
            Save change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
