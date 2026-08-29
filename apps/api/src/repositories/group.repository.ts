import { Group, Prisma, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"

/**
 * Groups. Org-scoped on every method, same as employees: single-row reads use
 * `findFirst` with the tenant predicate rather than `findUnique` on the id.
 */
class GroupRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
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
      },
    })
  }

  async findByName(
    organizationId: string,
    name: string,
    tx?: TxClient,
  ): Promise<Group | null> {

    return this.db(tx).group.findFirst({
      where: {
        name,
        organizationId,
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
      },
      data,
    })

    return result.count
  }

  async delete(organizationId: string, id: string, tx?: TxClient): Promise<number> {

    const result = await this.db(tx).group.deleteMany({
      where: {
        id,
        organizationId,
      },
    })

    return result.count
  }

  private buildWhere(organizationId: string, search?: string): Prisma.GroupWhereInput {

    const where: Prisma.GroupWhereInput = {
      organizationId,
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
