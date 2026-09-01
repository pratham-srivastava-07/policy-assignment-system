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

export type EmployeeGroupWithGroup = Prisma.EmployeeGroupGetPayload<{
  include: {
    group: {
      select: {
        id: true
        name: true
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

  async findMembershipsForEmployee(
    employeeId: string,
    asOf: Date,
    tx?: TxClient,
  ): Promise<EmployeeGroupWithGroup[]> {

    return this.db(tx).employeeGroup.findMany({
      where: {
        employeeId,
        ...this.effectiveOn(asOf),
      },
      include: {
        group: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        effectiveFrom: "desc",
      },
    })
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

  /**
   * The same lookup for a batch of employees, as a map. The population sweeps
   * behind /rules/:id/matching-employees and /rules/simulate need every
   * employee's groups at once; issuing one query per employee would not survive
   * an organization of any size.
   */
  async findGroupIdsForEmployees(
    employeeIds: string[],
    asOf: Date,
    tx?: TxClient,
  ): Promise<Map<string, string[]>> {

    const groups = new Map<string, string[]>()

    if (employeeIds.length === 0) {

      return groups
    }

    const rows = await this.db(tx).employeeGroup.findMany({
      where: {
        employeeId: {
          in: employeeIds,
        },
        ...this.effectiveOn(asOf),
      },
      select: {
        employeeId: true,
        groupId: true,
      },
    })

    for (const row of rows) {

      const existing = groups.get(row.employeeId)

      if (existing) {

        existing.push(row.groupId)

        continue
      }

      groups.set(row.employeeId, [row.groupId])
    }

    return groups
  }

  /**
   * End-date every open membership an employee holds. Termination uses this:
   * someone who has left the company is no longer in any of its groups.
   */
  async endAllOpenForEmployee(
    employeeId: string,
    effectiveTo: Date,
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).employeeGroup.updateMany({
      where: {
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
   * End-date every open membership OF A GROUP. Group deletion uses this: the
   * group stops existing on `effectiveTo`, so nobody is in it from that day on.
   *
   * The rows are closed, never removed. That is the whole point of soft-deleting
   * the group: "who was in this group on 1 January" — and therefore why an
   * assignment sourced from a GROUP rule was made — stays answerable after the
   * group is gone.
   */
  async endAllOpenForGroup(
    groupId: string,
    effectiveTo: Date,
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).employeeGroup.updateMany({
      where: {
        groupId,
        effectiveTo: null,
      },
      data: {
        effectiveTo,
      },
    })

    return result.count
  }

  /**
   * The employees whose membership of a group was open immediately before
   * `deletedOn` — the affected population of a group deletion.
   *
   * This is deliberately NOT the point-in-time predicate at `deletedOn`. By the
   * time this is asked, `endAllOpenForGroup` has already closed every open row
   * at exactly that date, and `effectiveTo` is exclusive, so the roster AS OF
   * `deletedOn` is empty by construction. What is wanted is the roster the
   * deletion just emptied:
   *
   *     effective_from <= deletedOn AND (effective_to IS NULL OR effective_to >= deletedOn)
   *
   * `>=` rather than `>` is what includes the rows the deletion itself closed.
   * It also picks up a membership that was already scheduled to end on that same
   * day, which is harmless: reconciliation is a diff, so an employee who needed
   * nothing done has nothing written.
   *
   * `effective_from <= deletedOn` keeps out a membership that was only ever
   * scheduled to START after the group was deleted — it never took effect, so it
   * never produced an assignment to remove.
   */
  async findMemberIdsOpenBeforeDeletion(
    groupId: string,
    deletedOn: Date,
    tx?: TxClient,
  ): Promise<string[]> {

    const rows = await this.db(tx).employeeGroup.findMany({
      where: {
        groupId,
        effectiveFrom: {
          lte: deletedOn,
        },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: deletedOn } },
        ],
      },
      select: {
        employeeId: true,
      },
      distinct: ["employeeId"],
    })

    return rows.map((row) => row.employeeId)
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
