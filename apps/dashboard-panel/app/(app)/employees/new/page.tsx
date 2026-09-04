"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Info } from "lucide-react"
import { z } from "zod"
import { PageHeader } from "@/components/layout"
import {
  Button,
  Field,
  FormErrorBanner,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui"
import * as employeeApi from "@/features/employees/api"
import { PERMISSIONS, useCan } from "@/lib/permissions"
import { QUERY_TIERS } from "@/lib/query"
import { isIsoDay } from "@/lib/dates"

/**
 * Client-side validation mirrors the API boundary so fields can show useful
 * messages. The API remains authoritative and returns the final write result.
 */
const optionalText = z.string().trim().max(100, "At most 100 characters")

const employeeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "At most 100 characters"),
  email: z.email("A valid email address is required").trim().max(254),
  hireDate: z.string().refine(isIsoDay, "A hire date is required"),
  employmentType: z
    .string()
    .trim()
    .min(1, "Employment type is required")
    .max(100, "At most 100 characters"),
  department: optionalText,
  role: optionalText,
  location: optionalText,
  state: optionalText,
  country: optionalText,
  managerId: z.string(),
  effectiveFrom: z
    .string()
    .refine((value) => value === "" || isIsoDay(value), "Use YYYY-MM-DD"),
})

type EmployeeFormValues = z.infer<typeof employeeSchema>

const optional = (value: string): string | undefined => {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export default function Page() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const canWrite = useCan(PERMISSIONS.EMPLOYEE_WRITE)
  const canBackdate = useCan(PERMISSIONS.EMPLOYEE_BACKDATE)
  const [submitError, setSubmitError] = useState<unknown>(null)
  const [managerSearch, setManagerSearch] = useState("")
  const [managerQuery, setManagerQuery] = useState("")

  useEffect(() => {
    const timer = window.setTimeout(() => setManagerQuery(managerSearch.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [managerSearch])

  const managers = useQuery({
    queryKey: ["employees", "manager-options", managerQuery],
    queryFn: ({ signal }) =>
      employeeApi.listEmployees(
        { status: "ACTIVE", ...(managerQuery ? { search: managerQuery } : {}) },
        { limit: 100, offset: 0 },
        signal,
      ),
    ...QUERY_TIERS.REFERENCE,
  })

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: "",
      email: "",
      hireDate: "",
      employmentType: "",
      department: "",
      role: "",
      location: "",
      state: "",
      country: "",
      managerId: "",
      effectiveFrom: "",
    },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitError(null)

    try {
      const employee = await employeeApi.createEmployee({
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        hireDate: values.hireDate,
        employmentType: values.employmentType.trim(),
        department: optional(values.department),
        role: optional(values.role),
        location: optional(values.location),
        state: optional(values.state),
        country: optional(values.country),
        managerId: optional(values.managerId),
        ...(canBackdate && values.effectiveFrom
          ? { effectiveFrom: values.effectiveFrom }
          : {}),
      })

      await queryClient.invalidateQueries({ queryKey: ["employees"] })
      void queryClient.invalidateQueries({ queryKey: ["reconciliation", "status"] })
      router.replace(`/employees/${employee.id}`)
    } catch (cause) {
      setSubmitError(cause)
    }
  })

  if (!canWrite) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Add employee" />
        <p className="text-sm text-ink-muted">
          You do not have permission to add employees.
        </p>
        <Button asChild size="sm" variant="secondary" className="self-start">
          <Link href="/employees">Back to employees</Link>
        </Button>
      </div>
    )
  }

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
        title="Add employee"
        description="Create the employee record that assignment rules evaluate."
      />

      <FormErrorBanner error={submitError} className="mb-4" />

      <form className="max-w-3xl space-y-6" onSubmit={onSubmit} noValidate>
        <section className="grid gap-4 rounded-md border border-border p-4 md:grid-cols-2">
          <Field id="employee-name" label="Name" error={form.formState.errors.name?.message}>
            <Input
              id="employee-name"
              autoFocus
              autoComplete="name"
              aria-invalid={Boolean(form.formState.errors.name)}
              {...form.register("name")}
            />
          </Field>

          <Field id="employee-email" label="Email" error={form.formState.errors.email?.message}>
            <Input
              id="employee-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(form.formState.errors.email)}
              {...form.register("email")}
            />
          </Field>

          <Field
            id="employee-hire-date"
            label="Hire date"
            error={form.formState.errors.hireDate?.message}
          >
            <Input
              id="employee-hire-date"
              type="date"
              aria-invalid={Boolean(form.formState.errors.hireDate)}
              {...form.register("hireDate")}
            />
          </Field>

          <Field
            id="employee-employment-type"
            label="Employment type"
            hint="Use the exact value your assignment rules expect."
            error={form.formState.errors.employmentType?.message}
          >
            <Input
              id="employee-employment-type"
              placeholder="FULL_TIME"
              aria-invalid={Boolean(form.formState.errors.employmentType)}
              {...form.register("employmentType")}
            />
          </Field>

          <Field id="employee-department" label="Department" error={form.formState.errors.department?.message}>
            <Input id="employee-department" {...form.register("department")} />
          </Field>

          <Field id="employee-role" label="Role" error={form.formState.errors.role?.message}>
            <Input id="employee-role" {...form.register("role")} />
          </Field>

          <Field id="employee-location" label="Location" error={form.formState.errors.location?.message}>
            <Input id="employee-location" autoComplete="address-level2" {...form.register("location")} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="employee-state" label="State" error={form.formState.errors.state?.message}>
              <Input id="employee-state" autoComplete="address-level1" {...form.register("state")} />
            </Field>
            <Field id="employee-country" label="Country" error={form.formState.errors.country?.message}>
              <Input id="employee-country" autoComplete="country" {...form.register("country")} />
            </Field>
          </div>
        </section>

        <section className="space-y-3 rounded-md border border-border p-4">
          <div>
            <h2 className="text-sm font-medium text-ink">Manager</h2>
            <p className="text-xs text-ink-subtle">
              Optional. Search active employees, then choose who this employee reports to.
            </p>
          </div>
          <Input
            value={managerSearch}
            onChange={(event) => setManagerSearch(event.target.value)}
            placeholder="Search employees"
            aria-label="Search manager options"
          />
          <Controller
            control={form.control}
            name="managerId"
            render={({ field }) => (
              <Field id="employee-manager" label="Reports to">
                <Select
                  value={field.value || "none"}
                  onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                  disabled={managers.isPending || Boolean(managers.error)}
                >
                  <SelectTrigger id="employee-manager" aria-label="Reports to">
                    <SelectValue placeholder="No manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No manager</SelectItem>
                    {(managers.data?.items ?? []).map((employee) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.name} ({employee.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
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
            ) : (managers.data?.items ?? []).length === 0 ? (
              <p className="text-xs text-ink-subtle">No active employees match that search.</p>
            ) : null}
          </div>
        </section>

        {canBackdate ? (
          <section className="rounded-md border border-border p-4">
            <Field
              id="employee-effective-from"
              label="Effective from"
              hint="Leave blank to make the initial attributes effective from the hire date."
              error={form.formState.errors.effectiveFrom?.message}
            >
              <Input
                id="employee-effective-from"
                type="date"
                aria-invalid={Boolean(form.formState.errors.effectiveFrom)}
                {...form.register("effectiveFrom")}
              />
            </Field>
          </section>
        ) : null}

        <div className="flex items-start gap-2 rounded-md bg-status-info-bg px-3 py-2 text-sm text-status-info">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Policy assignments are applied asynchronously after creation. You can review
            and reconcile them from the employee page.
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button asChild variant="secondary">
            <Link href="/employees">Cancel</Link>
          </Button>
          <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
            Create employee
          </Button>
        </div>
      </form>
    </>
  )
}
