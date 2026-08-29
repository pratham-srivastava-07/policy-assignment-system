import { z } from "zod"
import { isoDate, paginationQuery, uuid } from "./common"

const groupFields = {
  name: z.string().trim().min(1, "Group name is required").max(100),
  description: z.string().trim().max(500).nullable().optional(),
}

export const createGroupSchema = z.object(groupFields).strict()

/** PUT — a full replacement; an omitted description is cleared to NULL. */
export const replaceGroupSchema = z.object(groupFields).strict()

/** PATCH — a partial update. */
export const patchGroupSchema = z
  .object(groupFields)
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, "At least one field must be provided")

export const listGroupsQuerySchema = paginationQuery
  .extend({
    search: z.string().trim().min(1).max(100).optional(),
  })
  .strict()

/**
 * Adding a member. `effectiveFrom` defaults to today — membership is
 * effective-dated, so joining is a new row rather than a flag.
 */
export const addGroupMemberSchema = z
  .object({
    employeeId: uuid,
    effectiveFrom: isoDate.optional(),
  })
  .strict()

/**
 * Removing a member end-dates the membership rather than deleting it, so the
 * group's history stays reconstructible. `effectiveTo` is EXCLUSIVE: passing
 * today means the employee is not a member as of today.
 */
export const removeGroupMemberQuerySchema = z
  .object({
    effectiveTo: isoDate.optional(),
  })
  .strict()

export const groupMemberParamsSchema = z.object({
  id: uuid,
  employeeId: uuid,
})

/** Member listings are point-in-time, defaulting to today. */
export const listGroupMembersQuerySchema = paginationQuery
  .extend({
    asOf: isoDate.optional(),
  })
  .strict()

export type CreateGroupInput = z.infer<typeof createGroupSchema>

export type ReplaceGroupInput = z.infer<typeof replaceGroupSchema>

export type PatchGroupInput = z.infer<typeof patchGroupSchema>

export type ListGroupsQuery = z.infer<typeof listGroupsQuerySchema>

export type AddGroupMemberInput = z.infer<typeof addGroupMemberSchema>

export type RemoveGroupMemberQuery = z.infer<typeof removeGroupMemberQuerySchema>

export type ListGroupMembersQuery = z.infer<typeof listGroupMembersQuerySchema>
