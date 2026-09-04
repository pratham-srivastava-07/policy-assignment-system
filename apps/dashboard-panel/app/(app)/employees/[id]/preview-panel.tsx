"use client"

import { useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
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
  RadioGroup,
  RadioGroupItem,
  RateLimitNotice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui"
import { DiffRow, PolicyChip } from "@/components/policy"
import { isApiError } from "@/lib/api"
import { formatDay, isIsoDay, todayIso } from "@/lib/dates"
import { PERMISSIONS, useCan } from "@/lib/permissions"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import * as employeeApi from "@/features/employees/api"
import { useReconciliationStatus } from "@/features/reference/hooks"

/**
 * The server owns policy resolution. Attribute changes must be previewed for
 * the exact effective date that will be written. Manager changes are editable,
 * but the preview contract intentionally cannot model them (design.md §16).
 */
const EDITABLE = [
  { key: "department", label: "Department" },
  { key: "role", label: "Role" },
  { key: "state", label: "State" },
  { key: "location", label: "Location" },
  { key: "country", label: "Country" },
  { key: "employmentType", label: "Employment type" },
] as const

type EditableKey = (typeof EDITABLE)[number]["key"]

const employeeValue = (employee: EmployeeDTO, key: EditableKey): string =>
  employee[key] ?? ""

export const PreviewPanel = ({
  employee,
  onClose,
}: {
  employee: EmployeeDTO
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const canBackdate = useCan(PERMISSIONS.EMPLOYEE_BACKDATE)
  const { data: backlog } = useReconciliationStatus()
  const [currentDay] = useState(todayIso)
  const [draft, setDraft] = useState<Record<EditableKey, string>>(() =>
    Object.fromEntries(
      EDITABLE.map((field) => [field.key, employeeValue(employee, field.key)]),
    ) as Record<EditableKey, string>,
  )
  const [managerId, setManagerId] = useState(employee.managerId ?? "none")
  const [managerSearch, setManagerSearch] = useState("")
  const [managerQuery, setManagerQuery] = useState("")
  const [dateMode, setDateMode] = useState<"today" | "earlier">("today")
  const [earlierDate, setEarlierDate] = useState("")
  const [previewed, setPreviewed] = useState<{
    signature: string
    result: PreviewDTO
  } | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => setManagerQuery(managerSearch.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [managerSearch])

  const managers = useQuery({
    queryKey: ["employees", "manager-options", managerQuery, employee.id],
    queryFn: ({ signal }) =>
      employeeApi.listEmployees(
        { status: "ACTIVE", ...(managerQuery ? { search: managerQuery } : {}) },
        { limit: 100, offset: 0 },
        signal,
      ),
    ...QUERY_TIERS.REFERENCE,
  })

  const currentManager = useQuery({
    queryKey: queryKeys.employee(employee.managerId ?? "none"),
    queryFn: ({ signal }) => employeeApi.getEmployee(employee.managerId!, signal),
    enabled: employee.managerId !== null,
    ...QUERY_TIERS.REFERENCE,
  })

  const changes = useMemo(() => {
    const next: employeeApi.EmployeeChanges = {}

    for (const field of EDITABLE) {
      const value = draft[field.key].trim()
      if (value === employeeValue(employee, field.key)) continue

      if (field.key === "employmentType") next.employmentType = value
      else next[field.key] = value || null
    }

    return next
  }, [draft, employee])

  const validationError = useMemo(() => {
    if (!draft.employmentType.trim()) return "Employment type cannot be cleared."
    if (Object.values(draft).some((value) => value.trim().length > 100)) {
      return "Employee attributes must be 100 characters or fewer."
    }
    if (dateMode === "earlier" && (!isIsoDay(earlierDate) || earlierDate >= currentDay)) {
      return "Choose a valid date before today."
    }
    return null
  }, [currentDay, dateMode, draft, earlierDate])

  const attributeDirty = Object.keys(changes).length > 0
  const managerDirty = managerId !== (employee.managerId ?? "none")
  const dirty = attributeDirty || managerDirty
  const effectiveFrom = dateMode === "earlier" ? earlierDate : currentDay
  const previewSignature = JSON.stringify({ changes, effectiveFrom })
  const result = previewed?.signature === previewSignature ? previewed.result : null
  const selectedManager = managers.data?.items.find((option) => option.id === managerId)
  const managerLabel =
    managerId === "none"
      ? "No manager"
      : selectedManager?.name ??
        (managerId === employee.managerId ? currentManager.data?.name : undefined) ??
        "Selected manager"

  const preview = useMutation({
    mutationFn: (request: {
      changes: employeeApi.EmployeeChanges
      effectiveFrom: string
      signature: string
    }) => employeeApi.previewEmployee(employee.id, request.changes, request.effectiveFrom),
    onSuccess: (nextResult, request) => {
      setPreviewed({ signature: request.signature, result: nextResult })
    },
  })

  const save = useMutation({
    mutationFn: () =>
      employeeApi.patchEmployee(employee.id, {
        ...changes,
        ...(managerDirty ? { managerId: managerId === "none" ? null : managerId } : {}),
        effectiveFrom,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employee", employee.id] }),
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reconciliationStatus() }),
      ])
      onClose()
    },
  })

  const pendingBacklog = (backlog?.counts.PENDING ?? 0) + (backlog?.counts.PROCESSING ?? 0)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {employee.name}</DialogTitle>
          <DialogDescription>
            Review policy consequences before saving assignment-affecting attributes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          {EDITABLE.map((field) => {
            const current = employeeValue(employee, field.key)

            return (
              <Field
                key={field.key}
                id={`edit-${field.key}`}
                label={field.label}
                hint={current ? `Currently ${current}` : "Not set. Clear the field to keep it unset."}
              >
                <Input
                  id={`edit-${field.key}`}
                  value={draft[field.key]}
                  aria-invalid={
                    (field.key === "employmentType" && !draft.employmentType.trim()) ||
                    draft[field.key].trim().length > 100
                  }
                  onChange={(event) => {
                    setPreviewed(null)
                    setDraft((state) => ({ ...state, [field.key]: event.target.value }))
                  }}
                />
              </Field>
            )
          })}
        </div>

        <section className="space-y-3 border-t border-border pt-4">
          <div>
            <h3 className="text-sm font-medium text-ink">Manager</h3>
            <p className="text-xs text-ink-subtle">
              Search active employees, then choose who this employee reports to.
            </p>
          </div>
          <Input
            value={managerSearch}
            onChange={(event) => setManagerSearch(event.target.value)}
            placeholder="Search employees"
            aria-label="Search manager options"
          />
          <Field id="edit-employee-manager" label="Reports to">
            <Select
              value={managerId}
              onValueChange={setManagerId}
              disabled={managers.isPending || Boolean(managers.error)}
            >
              <SelectTrigger id="edit-employee-manager">
                <SelectValue>{managerLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No manager</SelectItem>
                {(managers.data?.items ?? [])
                  .filter((option) => option.id !== employee.id)
                  .map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name} ({option.email})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <div aria-live="polite">
            {managers.isPending ? (
              <p className="text-xs text-ink-subtle">Loading manager options...</p>
            ) : managers.error ? (
              <div className="flex items-center gap-2 text-xs text-status-danger">
                <span>Manager options could not be loaded.</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => managers.refetch()}>
                  Try again
                </Button>
              </div>
            ) : (managers.data?.items ?? []).filter((option) => option.id !== employee.id)
                .length === 0 ? (
              <p className="text-xs text-ink-subtle">No active employees match that search.</p>
            ) : null}
          </div>
          <p className="flex items-start gap-1.5 text-xs text-status-warning">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Manager changes are saved, but are not included in the policy preview.
          </p>
        </section>

        <section className="space-y-3 border-t border-border pt-4">
          <div>
            <h3 className="text-sm font-medium text-ink">Effective from</h3>
            <p className="text-xs text-ink-subtle">
              The preview and saved history use the same effective date.
            </p>
          </div>
          <RadioGroup
            value={dateMode}
            onValueChange={(value) => {
              setDateMode(value as "today" | "earlier")
              setPreviewed(null)
            }}
          >
            <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
              <RadioGroupItem value="today" className="mt-0.5" />
              <span>Today ({formatDay(currentDay)})</span>
            </label>
            {canBackdate ? (
              <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                <RadioGroupItem value="earlier" className="mt-2.5" />
                <span className="flex flex-col gap-1">
                  <span>Earlier date</span>
                  <Input
                    type="date"
                    value={earlierDate}
                    max={currentDay}
                    disabled={dateMode !== "earlier"}
                    aria-label="Earlier effective date"
                    onChange={(event) => {
                      setEarlierDate(event.target.value)
                      setPreviewed(null)
                    }}
                  />
                </span>
              </label>
            ) : null}
          </RadioGroup>
        </section>

        {validationError ? (
          <p className="text-sm text-status-danger" role="alert">
            {validationError}
          </p>
        ) : null}

        {preview.error ? (
          isApiError(preview.error) && preview.error.isRateLimited ? (
            <RateLimitNotice
              error={preview.error}
              what="previews"
              onRetry={() =>
                preview.mutate({ changes, effectiveFrom, signature: previewSignature })
              }
            />
          ) : (
            <FormErrorBanner error={preview.error} />
          )
        ) : null}

        {save.error ? <FormErrorBanner error={save.error} /> : null}

        {result ? (
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-xs font-medium text-ink-muted">
              Preview for {formatDay(effectiveFrom)}. Nothing has been saved.
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
            disabled={!attributeDirty || validationError !== null}
            loading={preview.isPending}
            onClick={() =>
              preview.mutate({ changes, effectiveFrom, signature: previewSignature })
            }
          >
            Preview change
          </Button>
          <Button
            variant="primary"
            disabled={!dirty || validationError !== null || (attributeDirty && result === null)}
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
