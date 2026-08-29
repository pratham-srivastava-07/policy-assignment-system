import { PolicyRule, Prisma, PrismaClass, RuleType } from "@policy/db"
import { RuleConditions } from "@policy/shared"
import { TxClient } from "../interfaces/db"

export interface CreatePolicyRuleRecord {
  policyId: string
  /** Set for RuleType.MANUAL and for nothing else — a CHECK constraint enforces it. */
  employeeId: string | null
  name: string
  ruleType: RuleType
  priority: number
  conditions: RuleConditions
  enabled: boolean
  effectiveFrom: Date
  effectiveTo: Date | null
}

export type UpdatePolicyRuleRecord = Partial<Omit<CreatePolicyRuleRecord, "policyId">> & {
  policyId?: string
  version?: number
}

/**
 * Assignment rules, including manual overrides.
 *
 * A manual override is a rule with `ruleType = MANUAL` and `employeeId` set; the
 * database enforces that pairing with a CHECK constraint, so this layer only has
 * to pass the values through.
 *
 * No HTTP surface exposes rules yet.
 */
class PolicyRuleRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  /** The system-wide point-in-time predicate as a WHERE fragment. */
  private effectiveOn(asOf: Date): Prisma.PolicyRuleWhereInput {

    return {
      effectiveFrom: {
        lte: asOf,
      },
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gt: asOf } },
      ],
    }
  }

  async create(
    organizationId: string,
    data: CreatePolicyRuleRecord,
    tx?: TxClient,
  ): Promise<PolicyRule> {

    return this.db(tx).policyRule.create({
      data: {
        ...data,
        organizationId,
        conditions: data.conditions as unknown as Prisma.InputJsonValue,
      },
    })
  }

  async findById(
    organizationId: string,
    id: string,
    tx?: TxClient,
  ): Promise<PolicyRule | null> {

    return this.db(tx).policyRule.findFirst({
      where: {
        id,
        organizationId,
      },
    })
  }

  /**
   * The assignment engine's main sweep: every enabled rule in force on `asOf`.
   * Ordered by descending priority so the caller receives candidates in
   * resolution order.
   */
  async findEffective(
    organizationId: string,
    asOf: Date,
    tx?: TxClient,
  ): Promise<PolicyRule[]> {

    return this.db(tx).policyRule.findMany({
      where: {
        organizationId,
        enabled: true,
        ...this.effectiveOn(asOf),
      },
      orderBy: [
        { priority: "desc" },
        { createdAt: "asc" },
      ],
    })
  }

  /**
   * Reconciliation fan-out: "an employee's department changed — which rules
   * depend on department?"
   */
  async findEnabledByRuleTypes(
    organizationId: string,
    ruleTypes: RuleType[],
    tx?: TxClient,
  ): Promise<PolicyRule[]> {

    return this.db(tx).policyRule.findMany({
      where: {
        organizationId,
        enabled: true,
        ruleType: {
          in: ruleTypes,
        },
      },
      orderBy: {
        priority: "desc",
      },
    })
  }

  /** Manual overrides targeting one employee. */
  async findManualForEmployee(
    organizationId: string,
    employeeId: string,
    tx?: TxClient,
  ): Promise<PolicyRule[]> {

    return this.db(tx).policyRule.findMany({
      where: {
        organizationId,
        employeeId,
        ruleType: "MANUAL",
      },
      orderBy: {
        priority: "desc",
      },
    })
  }

  /** Every rule that produces a given policy — used when a policy changes. */
  async findByPolicy(
    organizationId: string,
    policyId: string,
    tx?: TxClient,
  ): Promise<PolicyRule[]> {

    return this.db(tx).policyRule.findMany({
      where: {
        organizationId,
        policyId,
      },
      orderBy: {
        priority: "desc",
      },
    })
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdatePolicyRuleRecord,
    tx?: TxClient,
  ): Promise<number> {

    const { conditions, ...rest } = data

    const result = await this.db(tx).policyRule.updateMany({
      where: {
        id,
        organizationId,
      },
      data: {
        ...rest,
        ...(conditions !== undefined && {
          conditions: conditions as unknown as Prisma.InputJsonValue,
        }),
      },
    })

    return result.count
  }

  async delete(organizationId: string, id: string, tx?: TxClient): Promise<number> {

    const result = await this.db(tx).policyRule.deleteMany({
      where: {
        id,
        organizationId,
      },
    })

    return result.count
  }
}

export { PolicyRuleRepository }
