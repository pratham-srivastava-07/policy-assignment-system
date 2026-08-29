import { z } from "zod"
import { RULE_TYPES } from "@policy/shared"
import { isoDate, paginationQuery, uuid } from "./common"
import { ruleConditionsSchema } from "./conditions"

/**
 * Assignment rules, including manual overrides.
 *
 * The MANUAL pairing is enforced three times over, on purpose: here as a schema
 * refinement (so the admin gets a useful message), in the service (so the rule is
 * never constructed wrong), and in the database as a CHECK constraint (so nothing
 * can bypass either).
 */
const ruleFields = {
  policyId: uuid,
  name: z.string().trim().min(1, "Rule name is required").max(150),
  ruleType: z.enum(RULE_TYPES),
  /** Higher wins. How this composes with `ruleType` is an open product decision. */
  priority: z.number().int().min(0).max(1000),
  conditions: ruleConditionsSchema,
  enabled: z.boolean().optional(),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.nullable().optional(),
  /** Required for MANUAL rules, forbidden on every other type. */
  employeeId: uuid.nullable().optional(),
}

/** `effectiveTo` is exclusive, so it must be strictly after `effectiveFrom`. */
const effectiveRangeIsSane = (data: {
  effectiveFrom: string
  effectiveTo?: string | null
}) => {

  if (!data.effectiveTo) {

    return true
  }

  return data.effectiveTo > data.effectiveFrom
}

const manualPairingIsSane = (data: {
  ruleType: string
  employeeId?: string | null
  conditions: { all: unknown[] }
}) => {

  if (data.ruleType === "MANUAL") {

    return Boolean(data.employeeId)
  }

  return !data.employeeId
}

export const createRuleSchema = z
  .object(ruleFields)
  .strict()
  .refine(effectiveRangeIsSane, {
    message: "effectiveTo must be after effectiveFrom",
    path: ["effectiveTo"],
  })
  .refine(manualPairingIsSane, {
    message: "employeeId is required for MANUAL rules and forbidden on all others",
    path: ["employeeId"],
  })
  .refine(
    (data) => data.ruleType !== "MANUAL" || data.conditions.all.length === 0,
    {
      message: "A MANUAL rule targets one employee by id and takes no conditions",
      path: ["conditions"],
    },
  )
  .refine(
    (data) => data.ruleType !== "DEFAULT" || data.conditions.all.length === 0,
    {
      message: "A DEFAULT rule applies to everyone and takes no conditions",
      path: ["conditions"],
    },
  )

export const listRulesQuerySchema = paginationQuery
  .extend({
    policyId: uuid.optional(),
    ruleType: z.enum(RULE_TYPES).optional(),
    enabled: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  })
  .strict()

/**
 * Manual overrides get their own create shape: the employee comes from the path,
 * and `ruleType` is implied.
 */
export const createOverrideSchema = z
  .object({
    policyId: uuid,
    name: z.string().trim().min(1).max(150).optional(),
    priority: ruleFields.priority.optional(),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullable().optional(),
  })
  .strict()
  .refine(effectiveRangeIsSane, {
    message: "effectiveTo must be after effectiveFrom",
    path: ["effectiveTo"],
  })

export const ruleIdParamSchema = z.object({
  id: uuid,
})

export const overrideParamsSchema = z.object({
  id: uuid,
  ruleId: uuid,
})

export type CreateRuleInput = z.infer<typeof createRuleSchema>

export type ListRulesQuery = z.infer<typeof listRulesQuerySchema>

export type CreateOverrideInput = z.infer<typeof createOverrideSchema>
