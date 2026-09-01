import {
  Assignment,
  Cardinality,
  Prisma,
  PrismaClass,
  ResolutionStatus,
} from "@policy/db"
import { TxClient } from "../interfaces/db"

export interface CreateAssignmentRecord {
  employeeId: string
  policyId: string
  /** Denormalized from `policies.category_id`. */
  categoryId: string
  /** Denormalized from `policy_categories.cardinality`. */
  cardinality: Cardinality
  sourceRuleId: string
  sourceRuleVersion: number
  effectiveFrom: Date
  effectiveTo: Date | null
  resolutionStatus: ResolutionStatus
  resolutionReason: string
}

/** An assignment joined to everything needed to render an explanation. */
export type AssignmentWithContext = Prisma.AssignmentGetPayload<{
  include: {
    policy: true
    category: true
    sourceRuleVersionRow: true
  }
}>

export type AssignmentWithHolder = Prisma.AssignmentGetPayload<{
  include: {
    employee: {
      select: {
        id: true
        name: true
        email: true
      }
    }
    sourceRuleVersionRow: true
  }
}>

/**
 * Materialized policy assignments.
 *
 * SINGLE cardinality is enforced by a partial unique index in the database:
 *
 *     UNIQUE (organization_id, employee_id, category_id)
 *       WHERE cardinality = 'SINGLE' AND effective_to IS NULL
 *
 * so a second concurrent write for the same SINGLE category raises P2002 rather
 * than silently producing two current assignments. `close()` is the intended way
 * to supersede one: end the incumbent, then create the replacement, inside one
 * transaction.
 *
 * No HTTP surface exposes assignments yet.
 */
class AssignmentRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  /** The system-wide point-in-time predicate as a WHERE fragment. */
  private effectiveOn(asOf: Date): Prisma.AssignmentWhereInput {

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
    data: CreateAssignmentRecord,
    tx?: TxClient,
  ): Promise<Assignment> {

    return this.db(tx).assignment.create({
      data: {
        ...data,
        organizationId,
      },
    })
  }

  async findById(
    organizationId: string,
    id: string,
    tx?: TxClient,
  ): Promise<Assignment | null> {

    return this.db(tx).assignment.findFirst({
      where: {
        id,
        organizationId,
      },
    })
  }

  /** "Which policies applied to this employee on date D?" — the primary read. */
  async findForEmployeeAsOf(
    organizationId: string,
    employeeId: string,
    asOf: Date,
    tx?: TxClient,
  ): Promise<AssignmentWithContext[]> {

    return this.db(tx).assignment.findMany({
      where: {
        organizationId,
        employeeId,
        ...this.effectiveOn(asOf),
      },
      include: {
        policy: true,
        category: true,
        sourceRuleVersionRow: true,
      },
      orderBy: {
        effectiveFrom: "desc",
      },
    })
  }

  /** Every assignment an employee has ever held, newest first. */
  async findHistoryForEmployee(
    organizationId: string,
    employeeId: string,
    tx?: TxClient,
  ): Promise<AssignmentWithContext[]> {

    return this.db(tx).assignment.findMany({
      where: {
        organizationId,
        employeeId,
      },
      include: {
        policy: true,
        category: true,
        sourceRuleVersionRow: true,
      },
      orderBy: {
        effectiveFrom: "desc",
      },
    })
  }

  /** "Who holds this policy on date D?" */
  async findForPolicyAsOf(
    organizationId: string,
    policyId: string,
    asOf: Date,
    options: { limit: number; offset: number },
    tx?: TxClient,
  ): Promise<AssignmentWithHolder[]> {

    return this.db(tx).assignment.findMany({
      where: {
        organizationId,
        policyId,
        ...this.effectiveOn(asOf),
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        sourceRuleVersionRow: true,
      },
      orderBy: {
        effectiveFrom: "desc",
      },
      take: options.limit,
      skip: options.offset,
    })
  }

  async countForPolicyAsOf(
    organizationId: string,
    policyId: string,
    asOf: Date,
    tx?: TxClient,
  ): Promise<number> {

    return this.db(tx).assignment.count({
      where: {
        organizationId,
        policyId,
        ...this.effectiveOn(asOf),
      },
    })
  }

  /**
   * Reconciliation fan-out: everything a given rule currently produces.
   * Used when a rule is edited or disabled.
   */
  async findBySourceRule(
    organizationId: string,
    sourceRuleId: string,
    tx?: TxClient,
  ): Promise<Assignment[]> {

    return this.db(tx).assignment.findMany({
      where: {
        organizationId,
        sourceRuleId,
      },
    })
  }

  /**
   * The current assignment in a SINGLE category, if any — the row a new winning
   * rule has to supersede.
   */
  async findCurrentInCategory(
    organizationId: string,
    employeeId: string,
    categoryId: string,
    asOf: Date,
    tx?: TxClient,
  ): Promise<Assignment | null> {

    return this.db(tx).assignment.findFirst({
      where: {
        organizationId,
        employeeId,
        categoryId,
        ...this.effectiveOn(asOf),
      },
      orderBy: {
        effectiveFrom: "desc",
      },
    })
  }

  /** The same read, for a batch of employees — one query, not N. */
  async findForEmployeesAsOf(
    organizationId: string,
    employeeIds: string[],
    asOf: Date,
    tx?: TxClient,
  ): Promise<AssignmentWithContext[]> {

    if (employeeIds.length === 0) {

      return []
    }

    return this.db(tx).assignment.findMany({
      where: {
        organizationId,
        employeeId: {
          in: employeeIds,
        },
        ...this.effectiveOn(asOf),
      },
      include: {
        policy: true,
        category: true,
        sourceRuleVersionRow: true,
      },
      orderBy: [
        { employeeId: "asc" },
        { effectiveFrom: "desc" },
      ],
    })
  }

  async findByIdWithContext(
    organizationId: string,
    id: string,
    tx?: TxClient,
  ): Promise<AssignmentWithContext | null> {

    return this.db(tx).assignment.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        policy: true,
        category: true,
        sourceRuleVersionRow: true,
      },
    })
  }

  /**
   * End-date every open assignment an employee holds.
   *
   * Termination uses this: employment ended, so every policy derived from it
   * ends on the same day. Nothing is deleted — the history stays readable.
   */
  async closeAllOpenForEmployee(
    organizationId: string,
    employeeId: string,
    effectiveTo: Date,
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).assignment.updateMany({
      where: {
        organizationId,
        employeeId,
        effectiveTo: null,
      },
      data: {
        effectiveTo,
      },
    })

    return result.count
  }

  /**
   * Supersede an assignment by end-dating it. Assignments are never deleted
   * during reconciliation — history has to stay reconstructible.
   */
  async close(
    organizationId: string,
    id: string,
    effectiveTo: Date,
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).assignment.updateMany({
      where: {
        id,
        organizationId,
      },
      data: {
        effectiveTo,
      },
    })

    return result.count
  }
}

export { AssignmentRepository }
