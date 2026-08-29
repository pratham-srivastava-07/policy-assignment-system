import { z } from "zod"
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, isIsoDate } from "@policy/shared"

/** Every id in this system is a UUID. */
export const uuid = z.uuid({ message: "A valid id is required" })

export const email = z
  .email({ message: "A valid email address is required" })
  .trim()
  .toLowerCase()
  .max(254)

export const password = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number")
  .regex(/[^A-Za-z0-9]/, "Password must contain a special character")

export const shortText = z.string().trim().min(1).max(100)

/**
 * A calendar day, `YYYY-MM-DD`.
 *
 * Effective dates are org-local calendar days, never instants — accepting a
 * full timestamp here would let a timezone offset silently move a boundary by a
 * day. The parsed value is the UTC midnight that Postgres stores for a DATE.
 */
export const isoDate = z
  .string()
  .refine(isIsoDate, "Must be a calendar date in YYYY-MM-DD format")

export const isoDateToDate = isoDate.transform((value) => new Date(`${value}T00:00:00.000Z`))

/** Shared `?limit=&offset=` handling for list endpoints. */
export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
})

export const idParam = z.object({
  id: uuid,
})

export type PaginationQuery = z.infer<typeof paginationQuery>
