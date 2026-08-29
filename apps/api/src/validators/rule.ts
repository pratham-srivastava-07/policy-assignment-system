import { z } from "zod"
import { RULE_TYPES } from "@policy/shared"
import { asOfPaginationQuery, isoDate, paginationQuery, uuid } from "./common"
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
  /**
   * Higher wins, and priority is the SOLE authority for conflict resolution —
   * `ruleType` never re-enters the comparison once two priorities differ.
   *
   * Optional: a rule created without one takes the default band for its type
   * (MANUAL 1000 ... DEFAULT 100), which is a sensible starting number rather
   * than a second ordering dimension.
   */
  priority: z.number().int().min(0).max(1000).optional(),
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

/**
 * PATCH — a forward-only edit.
 *
 * Every field here is evaluable, so touching any of them mints a new rule
 * version; past assignments are never rewritten. `name` is the exception and is
 * handled with the rest only because it is snapshotted alongside them.
 *
 * `ruleType` and `employeeId` are NOT patchable. Changing either would break the
 * MANUAL pairing the database enforces, and turning a DEPARTMENT rule into a
 * personal override is a new rule, not an edit.
 */
export const patchRuleSchema = z
  .object({
    policyId: uuid.optional(),
    name: ruleFields.name.optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    conditions: ruleConditionsSchema.optional(),
    enabled: z.boolean().optional(),
    effectiveFrom: isoDate.optional(),
    effectiveTo: isoDate.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, "At least one field must be provided")
  .refine(
    (data) =>
      !data.effectiveFrom || !data.effectiveTo || data.effectiveTo > data.effectiveFrom,
    {
      message: "effectiveTo must be after effectiveFrom",
      path: ["effectiveTo"],
    },
  )

/** PATCH /rules/:id/priority — the one edit that has its own endpoint. */
export const patchRulePrioritySchema = z
  .object({
    priority: z.number().int().min(0).max(1000),
  })
  .strict()

/**
 * POST /rules/simulate — an unsaved rule body, run against the population.
 *
 * Nothing is written. `policyId` is not required: whether an employee matches
 * depends only on the conditions, and asking an admin to pick a policy before
 * they can see who a rule would catch gets the order of the work backwards.
 */
export const simulateRuleSchema = z
  .object({
    ruleType: z.enum(RULE_TYPES),
    conditions: ruleConditionsSchema,
    employeeId: uuid.nullable().optional(),
    asOf: isoDate.optional(),
    limit: paginationQuery.shape.limit,
    offset: paginationQuery.shape.offset,
  })
  .strict()
  .refine(manualPairingIsSane, {
    message: "employeeId is required for MANUAL rules and forbidden on all others",
    path: ["employeeId"],
  })
  .refine(
    (data) => data.ruleType !== "DEFAULT" || data.conditions.all.length === 0,
    {
      message: "A DEFAULT rule applies to everyone and takes no conditions",
      path: ["conditions"],
    },
  )

/** GET /rules/:id/matching-employees — a point-in-time population read. */
export const matchingEmployeesQuerySchema = asOfPaginationQuery.strict()

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

export type PatchRuleInput = z.infer<typeof patchRuleSchema>

export type PatchRulePriorityInput = z.infer<typeof patchRulePrioritySchema>

export type SimulateRuleInput = z.infer<typeof simulateRuleSchema>

export type MatchingEmployeesQuery = z.infer<typeof matchingEmployeesQuerySchema>

export type CreateRuleInput = z.infer<typeof createRuleSchema>

export type ListRulesQuery = z.infer<typeof listRulesQuerySchema>

export type CreateOverrideInput = z.infer<typeof createOverrideSchema>
