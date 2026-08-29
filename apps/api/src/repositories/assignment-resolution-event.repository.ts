import { AssignmentResolutionEvent, Prisma, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"

export interface CreateResolutionEventRecord {
  employeeId: string
  /** NULL when the evaluated rule produced no assignment — i.e. it lost. */
  assignmentId: string | null
  ruleId: string
  ruleVersion: number
  policyId: string
  categoryId: string
  decision: string
  reason: string
  evaluatedAt: Date
}

/**
 * The Assignment Engine's decision log — one row per rule considered, winners
 * and losers alike.
 *
 * Recording the losers is the whole point: "3 rules matched, the Executive rule
 * won on priority 100 > 50 > 10" is only answerable if the two that lost were
 * written down at the time.
 *
 * Append-only: no update or delete.
 */
class AssignmentResolutionEventRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  async createMany(
    organizationId: string,
    rows: CreateResolutionEventRecord[],
    tx?: TxClient,
  ): Promise<number> {

    if (rows.length === 0) {

      return 0
    }

    const data: Prisma.AssignmentResolutionEventCreateManyInput[] = rows.map((row) => ({
      ...row,
      organizationId,
    }))

    const result = await this.db(tx).assignmentResolutionEvent.createMany({
      data,
    })

    return result.count
  }

  /** The explainability panel: the most recent evaluations for one employee. */
  async findForEmployee(
    organizationId: string,
    employeeId: string,
    options: { limit: number; offset: number },
    tx?: TxClient,
  ): Promise<AssignmentResolutionEvent[]> {

    return this.db(tx).assignmentResolutionEvent.findMany({
      where: {
        organizationId,
        employeeId,
      },
      orderBy: {
        evaluatedAt: "desc",
      },
      take: options.limit,
      skip: options.offset,
    })
  }

  /** "Why does this specific assignment exist?" — drill-down from a row. */
  async findForAssignment(
    organizationId: string,
    assignmentId: string,
    tx?: TxClient,
  ): Promise<AssignmentResolutionEvent[]> {

    return this.db(tx).assignmentResolutionEvent.findMany({
      where: {
        organizationId,
        assignmentId,
      },
      orderBy: {
        evaluatedAt: "desc",
      },
    })
  }
}

export { AssignmentResolutionEventRepository }
