import { z } from "zod"
import { asOfPaginationQuery, isoDate, paginationQuery, uuid } from "./common"

/**
 * Reads over materialized policy state, plus the two writes that are not writes:
 * `preview` and `simulate` run the same engine and persist nothing.
 *
 * Every schema here carries an optional `asOf`. Policy state is time-dependent,
 * so "which policies apply?" and "which policies applied on 1 January?" are the
 * same question with a different day, and an endpoint that could only answer the
 * first would be answering the easier question.
 */

export const employeeAssignmentsQuerySchema = asOfPaginationQuery.strict()

/**
 * The batch read. `employeeIds` arrives as a comma-separated list because it is
 * a query parameter; it is capped so that one request cannot ask for an entire
 * organization's assignments in a single page.
 */
export const listAssignmentsQuerySchema = asOfPaginationQuery
  .extend({
    employeeIds: z
      .string()
      .trim()
      .min(1, "At least one employee id is required")
      .transform((value) =>
        value
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      )
      .pipe(
        z
          .array(uuid)
          .min(1, "At least one employee id is required")
          .max(100, "At most 100 employee ids may be requested at once"),
      ),
  })
  .strict()

/**
 * A hypothetical employee. Every key is optional and only the ones present are
 * applied on top of the real record — this is "what would happen if she moved to
 * Sales?", not a replacement.
 *
 * `groupIds`, when present, replaces the whole membership set: a hypothetical
 * with no group is a real question, so absence has to mean "unchanged" and an
 * empty array has to mean "no groups".
 */
const hypotheticalText = z.string().trim().min(1).max(100)

export const previewEmployeeSchema = z
  .object({
    asOf: isoDate.optional(),
    changes: z
      .object({
        department: hypotheticalText.nullable().optional(),
        role: hypotheticalText.nullable().optional(),
        location: hypotheticalText.nullable().optional(),
        state: hypotheticalText.nullable().optional(),
        country: hypotheticalText.nullable().optional(),
        employmentType: hypotheticalText.optional(),
        isManager: z.boolean().optional(),
        hireDate: isoDate.optional(),
        groupIds: z.array(uuid).max(100).optional(),
      })
      .strict()
      .refine(
        (changes) => Object.keys(changes).length > 0,
        "At least one hypothetical change must be provided",
      ),
  })
  .strict()

/** POST /reconciliation/employees/:id — a synchronous materialization run. */
export const reconcileEmployeeSchema = z
  .object({
    asOf: isoDate.optional(),
  })
  .strict()

/**
 * GET /access — application access, read out of the assignments in the
 * APPLICATION_ACCESS category. `emp` names the employee, as the endpoint
 * specifies.
 */
export const accessQuerySchema = asOfPaginationQuery
  .extend({
    emp: uuid,
  })
  .strict()

/**
 * PUT / PATCH /access.
 *
 * There is no POST: access is derived, never written. These create or update a
 * MANUAL override rule that produces an application policy, and the engine turns
 * that into an assignment like any other.
 */
export const grantAccessSchema = z
  .object({
    employeeId: uuid,
    policyId: uuid,
    effectiveFrom: isoDate.optional(),
    effectiveTo: isoDate.nullable().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
  })
  .strict()
  .refine(
    (data) => !data.effectiveTo || !data.effectiveFrom || data.effectiveTo > data.effectiveFrom,
    {
      message: "effectiveTo must be after effectiveFrom",
      path: ["effectiveTo"],
    },
  )

export const employeeAuditQuerySchema = paginationQuery.strict()

export type EmployeeAssignmentsQuery = z.infer<typeof employeeAssignmentsQuerySchema>

export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>

export type PreviewEmployeeInput = z.infer<typeof previewEmployeeSchema>

export type ReconcileEmployeeInput = z.infer<typeof reconcileEmployeeSchema>

export type AccessQuery = z.infer<typeof accessQuerySchema>

export type GrantAccessInput = z.infer<typeof grantAccessSchema>

export type EmployeeAuditQuery = z.infer<typeof employeeAuditQuerySchema>
