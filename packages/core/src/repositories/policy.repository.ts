import { Policy, PolicyStatus, Prisma, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"

export interface PolicyListFilters {
  categoryId?: string
  status?: PolicyStatus
  search?: string
}

/** A policy joined to the category that supplies its cardinality. */
export type PolicyWithCategory = Prisma.PolicyGetPayload<{
  include: {
    category: true
  }
}>

/**
 * Policies. No HTTP surface yet — the assignment engine reads through here, and
 * `findWithCategory` is what supplies the `categoryId` / `cardinality` pair that
 * gets denormalized onto every assignment.
 */
class PolicyRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  async create(
    organizationId: string,
    data: {
      categoryId: string
      name: string
      description: string | null
      status: PolicyStatus
    },
    tx?: TxClient,
  ): Promise<Policy> {

    return this.db(tx).policy.create({
      data: {
        ...data,
        organizationId,
      },
    })
  }

  async findById(organizationId: string, id: string, tx?: TxClient): Promise<Policy | null> {

    return this.db(tx).policy.findFirst({
      where: {
        id,
        organizationId,
      },
    })
  }

  /**
   * The read the engine needs: a policy plus its category, so an assignment can
   * be stamped with `categoryId` and `cardinality` without a second round trip.
   */
  async findWithCategory(
    organizationId: string,
    id: string,
    tx?: TxClient,
  ): Promise<PolicyWithCategory | null> {

    return this.db(tx).policy.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        category: true,
      },
    })
  }

  private buildWhere(
    organizationId: string,
    options: PolicyListFilters,
  ): Prisma.PolicyWhereInput {

    return {
      organizationId,
      ...(options.categoryId !== undefined && { categoryId: options.categoryId }),
      ...(options.status !== undefined && { status: options.status }),
      ...(options.search !== undefined && {
        name: { contains: options.search, mode: "insensitive" },
      }),
    }
  }

  async findMany(
    organizationId: string,
    options: PolicyListFilters & { limit: number; offset: number },
    tx?: TxClient,
  ): Promise<Policy[]> {

    return this.db(tx).policy.findMany({
      where: this.buildWhere(organizationId, options),
      orderBy: {
        name: "asc",
      },
      take: options.limit,
      skip: options.offset,
    })
  }

  async count(
    organizationId: string,
    options: PolicyListFilters = {},
    tx?: TxClient,
  ): Promise<number> {

    return this.db(tx).policy.count({
      where: this.buildWhere(organizationId, options),
    })
  }

  async update(
    organizationId: string,
    id: string,
    data: { name?: string; description?: string | null; status?: PolicyStatus },
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).policy.updateMany({
      where: {
        id,
        organizationId,
      },
      data,
    })

    return result.count
  }

  async delete(organizationId: string, id: string, tx?: TxClient): Promise<number> {

    const result = await this.db(tx).policy.deleteMany({
      where: {
        id,
        organizationId,
      },
    })

    return result.count
  }
}

export { PolicyRepository }
