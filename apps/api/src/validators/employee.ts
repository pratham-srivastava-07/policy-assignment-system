import { z } from "zod"
import { EMPLOYEE_STATUSES } from "@policy/shared"
import { email, isoDate, paginationQuery, shortText, uuid } from "./common"

const optionalText = z.string().trim().min(1).max(100)

/**
 * `hireDate` is a calendar day. Tenure is derived from it at evaluation time and
 * is never accepted or stored as a value of its own.
 */
const employeeFields = {
  name: shortText,
  email,
  hireDate: isoDate,
  employmentType: optionalText,
  department: optionalText.nullable().optional(),
  role: optionalText.nullable().optional(),
  location: optionalText.nullable().optional(),
  state: optionalText.nullable().optional(),
  country: optionalText.nullable().optional(),
  /**
   * Who this employee reports to. Nullable — `null` clears the edge and makes
   * them unparented; omitted on PUT means the same thing, since PUT clears what
   * it does not mention.
   *
   * The service validates the rest: same organization, not the employee
   * themselves, not terminated, and not already somewhere below the employee in
   * the chart.
   */
  managerId: uuid.nullable().optional(),
  // DECISION: `isManager` stays accepted so that an existing client sending it
  // does not start failing a `.strict()` schema, but it is IGNORED. The column
  // is derived from `managerId` (see the schema comment on
  // `Employee.isManager`), and the service recomputes it from the actual direct
  // reports on every write. Honouring an authored value here would let a caller
  // put the flag out of step with the org chart it summarizes.
  isManager: z.boolean().optional(),
}

/**
 * Optional on every write: the calendar day from which the new attribute values
 * take effect, defaulting to today.
 *
 * This is what lands in `employee_attribute_history.effective_from`, so a
 * back-dated correction ("she actually moved to Texas on 1 March") produces the
 * right history rather than pretending the change happened today.
 */
const effectiveFrom = isoDate.optional()

export const createEmployeeSchema = z
  .object({
    ...employeeFields,
    effectiveFrom,
  })
  .strict()

/** PUT — a full replacement. Omitted optional attributes are cleared to NULL. */
export const replaceEmployeeSchema = z
  .object({
    ...employeeFields,
    effectiveFrom,
  })
  .strict()

/** PATCH — a partial update. Only the keys present are touched. */
export const patchEmployeeSchema = z
  .object(employeeFields)
  .extend({ effectiveFrom })
  .partial()
  .strict()
  .refine(
    (data) => Object.keys(data).some((key) => key !== "effectiveFrom"),
    "At least one field must be provided",
  )

export const listEmployeesQuerySchema = paginationQuery
  .extend({
    department: optionalText.optional(),
    state: optionalText.optional(),
    country: optionalText.optional(),
    location: optionalText.optional(),
    employmentType: optionalText.optional(),
    role: optionalText.optional(),
    isManager: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    // DECISION: the list is NOT filtered to ACTIVE by default. Terminated
    // employees were visible here before termination existed, and silently
    // hiding rows from an endpoint that used to return them is the more
    // surprising behaviour of the two. Callers narrow explicitly.
    status: z.enum(EMPLOYEE_STATUSES).optional(),
    search: z.string().trim().min(1).max(100).optional(),
  })
  .strict()

/**
 * `DELETE /employees/:id` is a termination, so it carries an optional calendar
 * day: the last day of employment defaults to today, but a departure recorded
 * after the fact needs the day it actually happened.
 */
export const terminateEmployeeSchema = z
  .object({
    terminatedOn: isoDate.optional(),
  })
  .strict()

export type TerminateEmployeeInput = z.infer<typeof terminateEmployeeSchema>

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>

export type ReplaceEmployeeInput = z.infer<typeof replaceEmployeeSchema>

export type PatchEmployeeInput = z.infer<typeof patchEmployeeSchema>

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>
