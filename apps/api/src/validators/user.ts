import { z } from "zod"
import { ORGANIZATION_ROLES } from "@policy/shared"
import { email, password, paginationQuery, shortText, uuid } from "./common"

/**
 * Creating a user through this slice adds a teammate to the CALLER's
 * organization — the organization comes from the session, never from the body,
 * so there is no `organizationId` field here by design.
 */
export const createUserSchema = z
  .object({
    name: shortText,
    email,
    password,
    role: z.enum(ORGANIZATION_ROLES),
    /** Optionally link this login to an existing employee record. */
    employeeId: uuid.nullable().optional(),
  })
  .strict()

export const updateUserSchema = z
  .object({
    name: shortText.optional(),
    email: email.optional(),
    password: password.optional(),
    employeeId: uuid.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "At least one field must be provided")

export const listUsersQuerySchema = paginationQuery.strict()

export const findUserByEmailQuerySchema = z
  .object({
    email,
  })
  .strict()

export type CreateUserInput = z.infer<typeof createUserSchema>

export type UpdateUserInput = z.infer<typeof updateUserSchema>

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>
