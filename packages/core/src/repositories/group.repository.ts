import { Group, Prisma, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"

/**
 * Groups. Org-scoped on every method, same as employees: single-row reads use
 * `findFirst` with the tenant predicate rather than `findUnique` on the id.
 *
 * Groups are SOFT-deleted. `deletedOn` records the calendar day the group
 * stopped existing, the row and its `employee_groups` history stay, and every
 * read here filters the deleted rows out — so a deleted group is invisible to
 * the API while remaining available to reconciliation and explainability, which
 * ask about the past on purpose.
 *
 * The one place that predicate is written is `live()`. Nothing in this class
 * queries `group` without it.
 */
class GroupRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  /** "Not deleted", as a reusable WHERE fragment. */
  private live(): Prisma.GroupWhereInput {

    return {
      deletedOn: null,
    }
  }

  async create(
    organizationId: string,
    data: { name: string; description: string | null },
    tx?: TxClient,
  ): Promise<Group> {

    return this.db(tx).group.create({
      data: {
        ...data,
        organizationId,
      },
    })
  }

  async findById(organizationId: string, id: string, tx?: TxClient): Promise<Group | null> {

    return this.db(tx).group.findFirst({
      where: {
        id,
        organizationId,
        ...this.live(),
      },
    })
  }

  /**
   * Name lookup for the duplicate check, live rows only.
   *
   * A deleted group no longer reserves its name — the partial unique index in
   * the database says the same thing — so a name may be reused once the group
   * holding it has been deleted.
   */
  async findByName(
    organizationId: string,
    name: string,
    tx?: TxClient,
  ): Promise<Group | null> {

    return this.db(tx).group.findFirst({
      where: {
        name,
        organizationId,
        ...this.live(),
      },
    })
  }

  async findMany(
    organizationId: string,
    options: { limit: number; offset: number; search?: string },
    tx?: TxClient,
  ): Promise<Group[]> {

    return this.db(tx).group.findMany({
      where: this.buildWhere(organizationId, options.search),
      orderBy: {
        name: "asc",
      },
      take: options.limit,
      skip: options.offset,
    })
  }

  async count(organizationId: string, search?: string, tx?: TxClient): Promise<number> {

    return this.db(tx).group.count({
      where: this.buildWhere(organizationId, search),
    })
  }

  async update(
    organizationId: string,
    id: string,
    data: { name?: string; description?: string | null },
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).group.updateMany({
      where: {
        id,
        organizationId,
        ...this.live(),
      },
      data,
    })

    return result.count
  }

  /**
   * Soft deletion: stamp the day, keep the row.
   *
   * The `deletedOn: null` predicate is what makes a second delete a no-op — it
   * matches nothing and returns 0, so the caller enqueues no second outbox row
   * and the original deletion date is never overwritten by a later one.
   */
  async softDelete(
    organizationId: string,
    id: string,
    deletedOn: Date,
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).group.updateMany({
      where: {
        id,
        organizationId,
        ...this.live(),
      },
      data: {
        deletedOn,
      },
    })

    return result.count
  }

  private buildWhere(organizationId: string, search?: string): Prisma.GroupWhereInput {

    const where: Prisma.GroupWhereInput = {
      organizationId,
      ...this.live(),
    }

    if (search) {

      where.name = {
        contains: search,
        mode: "insensitive",
      }
    }

    return where
  }
}

export { GroupRepository }
