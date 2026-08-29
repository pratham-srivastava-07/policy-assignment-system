import { z } from "zod"
import { email, isoDate, paginationQuery, shortText } from "./common"

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
    search: z.string().trim().min(1).max(100).optional(),
  })
  .strict()

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>

export type ReplaceEmployeeInput = z.infer<typeof replaceEmployeeSchema>

export type PatchEmployeeInput = z.infer<typeof patchEmployeeSchema>

export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>
