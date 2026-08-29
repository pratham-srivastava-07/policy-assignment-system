import { EmployeeGroup, Prisma, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"

/** A membership row joined to the employee it names, for member listings. */
export type EmployeeGroupWithEmployee = Prisma.EmployeeGroupGetPayload<{
  include: {
    employee: {
      select: {
        id: true
        name: true
        email: true
      }
    }
  }
}>

/**
 * Effective-dated group membership.
 *
 * Nothing here is ever hard-deleted on removal: leaving a group closes the row
 * by setting `effectiveTo`, so "which groups was this employee in on 1 January"
 * stays answerable. The point-in-time predicate is the same one used everywhere:
 *
 *     effectiveFrom <= asOf AND (effectiveTo IS NULL OR effectiveTo > asOf)
 *
 * The table itself has no `organization_id` — both sides of the join already
 * carry one — so callers must resolve the group and employee through their
 * org-scoped repositories first.
 */
class EmployeeGroupRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  /** The point-in-time predicate, as a reusable WHERE fragment. */
  private effectiveOn(asOf: Date): Prisma.EmployeeGroupWhereInput {

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
    data: {
      employeeId: string
      groupId: string
      effectiveFrom: Date
      effectiveTo: Date | null
    },
    tx?: TxClient,
  ): Promise<EmployeeGroup> {

    return this.db(tx).employeeGroup.create({
      data,
    })
  }

  /** The membership that is in force for this employee/group pair on `asOf`. */
  async findEffective(
    groupId: string,
    employeeId: string,
    asOf: Date,
    tx?: TxClient,
  ): Promise<EmployeeGroup | null> {

    return this.db(tx).employeeGroup.findFirst({
      where: {
        groupId,
        employeeId,
        ...this.effectiveOn(asOf),
      },
      orderBy: {
        effectiveFrom: "desc",
      },
    })
  }

  async findMembers(
    groupId: string,
    asOf: Date,
    options: { limit: number; offset: number },
    tx?: TxClient,
  ): Promise<EmployeeGroupWithEmployee[]> {

    return this.db(tx).employeeGroup.findMany({
      where: {
        groupId,
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
      },
      orderBy: {
        effectiveFrom: "desc",
      },
      take: options.limit,
      skip: options.offset,
    })
  }

  async countMembers(groupId: string, asOf: Date, tx?: TxClient): Promise<number> {

    return this.db(tx).employeeGroup.count({
      where: {
        groupId,
        ...this.effectiveOn(asOf),
      },
    })
  }

  /**
   * The group ids an employee belonged to on `asOf` — what backs the `groupId`
   * condition attribute during rule evaluation.
   */
  async findGroupIdsForEmployee(
    employeeId: string,
    asOf: Date,
    tx?: TxClient,
  ): Promise<string[]> {

    const rows = await this.db(tx).employeeGroup.findMany({
      where: {
        employeeId,
        ...this.effectiveOn(asOf),
      },
      select: {
        groupId: true,
      },
    })

    return rows.map((row) => row.groupId)
  }

  /** Full membership history for an employee, newest first. */
  async findHistoryForEmployee(
    employeeId: string,
    tx?: TxClient,
  ): Promise<EmployeeGroup[]> {

    return this.db(tx).employeeGroup.findMany({
      where: {
        employeeId,
      },
      orderBy: {
        effectiveFrom: "desc",
      },
    })
  }

  /** Removal: close the row rather than delete it. */
  async endMembership(id: string, effectiveTo: Date, tx?: TxClient): Promise<EmployeeGroup> {

    return this.db(tx).employeeGroup.update({
      where: {
        id,
      },
      data: {
        effectiveTo,
      },
    })
  }
}

export { EmployeeGroupRepository }
