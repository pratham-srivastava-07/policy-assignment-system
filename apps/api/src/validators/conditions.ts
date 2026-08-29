import { z } from "zod"
import {
  BOOLEAN_ATTRIBUTES,
  CONDITION_ATTRIBUTES,
  CONDITION_OPERATORS,
  ConditionAttribute,
  LIST_OPERATORS,
  NUMERIC_ATTRIBUTES,
  ORDERED_OPERATORS,
  RULE_CONDITIONS_VERSION,
} from "@policy/shared"

/**
 * Validation for the rule condition envelope.
 *
 * Structural validation (is it the right shape?) and domain validation (does this
 * operator make sense for this attribute?) both happen here, because a clause that
 * type-checks but is semantically nonsense — `department gte 5` — would otherwise
 * only fail at evaluation time, long after the admin who wrote it left the screen.
 */

const scalar = z.union([z.string(), z.number(), z.boolean()])

const clauseShape = z.object({
  attribute: z.enum(CONDITION_ATTRIBUTES),
  op: z.enum(CONDITION_OPERATORS),
  value: z.union([scalar, z.array(scalar).min(1, "A list operator needs at least one value")]),
})

/** The value type each attribute expects. */
const expectedType = (attribute: ConditionAttribute): "number" | "boolean" | "string" => {

  if (NUMERIC_ATTRIBUTES.includes(attribute)) {

    return "number"
  }

  if (BOOLEAN_ATTRIBUTES.includes(attribute)) {

    return "boolean"
  }

  return "string"
}

export const conditionClauseSchema = clauseShape.superRefine((clause, ctx) => {

  const isListOp = LIST_OPERATORS.includes(clause.op)
  const isArray = Array.isArray(clause.value)

  if (isListOp && !isArray) {

    ctx.addIssue({
      code: "custom",
      message: `Operator "${clause.op}" requires an array value`,
    })

    return
  }

  if (!isListOp && isArray) {

    ctx.addIssue({
      code: "custom",
      message: `Operator "${clause.op}" requires a single value, not an array`,
    })

    return
  }

  // Ordered comparison only means something on a numeric attribute. Allowing
  // `state gt "California"` would silently compare strings.
  if (ORDERED_OPERATORS.includes(clause.op) && expectedType(clause.attribute) !== "number") {

    ctx.addIssue({
      code: "custom",
      message: `Operator "${clause.op}" is only valid on a numeric attribute; "${clause.attribute}" is not one`,
    })

    return
  }

  const expected = expectedType(clause.attribute)
  const values = isArray ? (clause.value as unknown[]) : [clause.value]

  for (const value of values) {

    if (typeof value !== expected) {

      ctx.addIssue({
        code: "custom",
        message: `Attribute "${clause.attribute}" expects a ${expected} value, received ${typeof value}`,
      })

      return
    }
  }
})

/**
 * The stored envelope. `version` is pinned to the only grammar that exists; a
 * future nested-boolean grammar becomes version 2 and this becomes a union,
 * without a migration.
 */
export const ruleConditionsSchema = z
  .object({
    version: z.literal(RULE_CONDITIONS_VERSION),
    all: z.array(conditionClauseSchema),
  })
  .strict()
  .superRefine((conditions, ctx) => {

    const seen = new Set<string>()

    for (const clause of conditions.all) {

      // Every clause is ANDed, so two clauses on one attribute are usually a
      // mistake — `department eq "Sales"` AND `department eq "Engineering"`
      // matches nobody. Ranges are the legitimate exception.
      const key = `${clause.attribute}:${clause.op}`

      if (seen.has(key)) {

        ctx.addIssue({
          code: "custom",
          message: `Duplicate condition on "${clause.attribute}" with operator "${clause.op}"`,
        })
      }

      seen.add(key)
    }
  })

export type RuleConditionsInput = z.infer<typeof ruleConditionsSchema>
