import { PolicyRuleVersion, Prisma, PrismaClass, RuleType } from "@policy/db"
import { RuleConditions } from "@policy/shared"
import { TxClient } from "../interfaces/db"

export interface CreatePolicyRuleVersionRecord {
  ruleId: string
  version: number
  policyId: string
  employeeId: string | null
  name: string
  ruleType: RuleType
  priority: number
  conditions: RuleConditions
  enabled: boolean
  effectiveFrom: Date
  effectiveTo: Date | null
  createdBy: string | null
}

/**
 * Immutable rule snapshots.
 *
 * Assignments point at `(rule_id, version)` rather than at the live rule, so an
 * assignment made months ago can still be explained against the rule text that
 * produced it even after the rule has been edited. There is no update method
 * here on purpose: a version is written once and never changed.
 *
 * Snapshots are written in the same transaction as the rule create/update that
 * produced them.
 */
class PolicyRuleVersionRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  async create(
    data: CreatePolicyRuleVersionRecord,
    tx?: TxClient,
  ): Promise<PolicyRuleVersion> {

    return this.db(tx).policyRuleVersion.create({
      data: {
        ...data,
        conditions: data.conditions as unknown as Prisma.InputJsonValue,
      },
    })
  }

  async findVersion(
    ruleId: string,
    version: number,
    tx?: TxClient,
  ): Promise<PolicyRuleVersion | null> {

    return this.db(tx).policyRuleVersion.findUnique({
      where: {
        ruleId_version: {
          ruleId,
          version,
        },
      },
    })
  }

  /** A rule's full edit history, newest version first. */
  async findHistory(ruleId: string, tx?: TxClient): Promise<PolicyRuleVersion[]> {

    return this.db(tx).policyRuleVersion.findMany({
      where: {
        ruleId,
      },
      orderBy: {
        version: "desc",
      },
    })
  }

  async findLatest(ruleId: string, tx?: TxClient): Promise<PolicyRuleVersion | null> {

    return this.db(tx).policyRuleVersion.findFirst({
      where: {
        ruleId,
      },
      orderBy: {
        version: "desc",
      },
    })
  }
}

export { PolicyRuleVersionRepository }
