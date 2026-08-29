import { z } from "zod"
import { CARDINALITIES, POLICY_STATUSES } from "@policy/shared"
import { paginationQuery, uuid } from "./common"

// ---------------------------------------------------------------------------
// Policy categories
// ---------------------------------------------------------------------------

/**
 * `key` is the stable machine identifier an admin references, so it is
 * constrained to a slug rather than free text — it ends up in rule
 * configuration and, later, in the `/access` category convention.
 */
const categoryKey = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, "Key must be lowercase letters, digits and underscores")

const categoryFields = {
  name: z.string().trim().min(1, "Name is required").max(100),
  key: categoryKey,
  cardinality: z.enum(CARDINALITIES),
}

export const createPolicyCategorySchema = z.object(categoryFields).strict()

/**
 * `cardinality` is deliberately NOT patchable. Moving a category from MULTIPLE to
 * SINGLE would invalidate assignments that already exist and is a data migration,
 * not a field edit.
 */
export const patchPolicyCategorySchema = z
  .object({
    name: categoryFields.name.optional(),
    key: categoryKey.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "At least one field must be provided")

export const listPolicyCategoriesQuerySchema = paginationQuery.strict()

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

const policyFields = {
  categoryId: uuid,
  name: z.string().trim().min(1, "Name is required").max(150),
  description: z.string().trim().max(1000).nullable().optional(),
  status: z.enum(POLICY_STATUSES).optional(),
}

export const createPolicySchema = z.object(policyFields).strict()

/** PUT — an omitted description is cleared; an omitted status resets to DRAFT. */
export const replacePolicySchema = z
  .object({
    name: policyFields.name,
    description: policyFields.description,
    status: policyFields.status,
  })
  .strict()

/** PATCH — `categoryId` is not patchable: it would change the cardinality rules
 * an existing assignment was created under. */
export const patchPolicySchema = z
  .object({
    name: policyFields.name.optional(),
    description: policyFields.description,
    status: policyFields.status,
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "At least one field must be provided")

export const listPoliciesQuerySchema = paginationQuery
  .extend({
    categoryId: uuid.optional(),
    status: z.enum(POLICY_STATUSES).optional(),
  })
  .strict()

export type CreatePolicyCategoryInput = z.infer<typeof createPolicyCategorySchema>

export type PatchPolicyCategoryInput = z.infer<typeof patchPolicyCategorySchema>

export type ListPolicyCategoriesQuery = z.infer<typeof listPolicyCategoriesQuerySchema>

export type CreatePolicyInput = z.infer<typeof createPolicySchema>

export type ReplacePolicyInput = z.infer<typeof replacePolicySchema>

export type PatchPolicyInput = z.infer<typeof patchPolicySchema>

export type ListPoliciesQuery = z.infer<typeof listPoliciesQuerySchema>
