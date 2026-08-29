import { Cardinality, PolicyCategory, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"

/**
 * Policy categories — the unit that carries assignment cardinality.
 *
 * No HTTP surface exposes these yet; the repository exists because the
 * assignment engine needs `cardinality` to stamp onto assignments, and because
 * `assignments.cardinality` is denormalized from here.
 */
class PolicyCategoryRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  async create(
    organizationId: string,
    data: { name: string; key: string; cardinality: Cardinality },
    tx?: TxClient,
  ): Promise<PolicyCategory> {

    return this.db(tx).policyCategory.create({
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
  ): Promise<PolicyCategory | null> {

    return this.db(tx).policyCategory.findFirst({
      where: {
        id,
        organizationId,
      },
    })
  }

  async findByKey(
    organizationId: string,
    key: string,
    tx?: TxClient,
  ): Promise<PolicyCategory | null> {

    return this.db(tx).policyCategory.findFirst({
      where: {
        key,
        organizationId,
      },
    })
  }

  async findAll(organizationId: string, tx?: TxClient): Promise<PolicyCategory[]> {

    return this.db(tx).policyCategory.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        name: "asc",
      },
    })
  }

  async update(
    organizationId: string,
    id: string,
    data: { name?: string; key?: string; cardinality?: Cardinality },
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).policyCategory.updateMany({
      where: {
        id,
        organizationId,
      },
      data,
    })

    return result.count
  }

  async delete(organizationId: string, id: string, tx?: TxClient): Promise<number> {

    const result = await this.db(tx).policyCategory.deleteMany({
      where: {
        id,
        organizationId,
      },
    })

    return result.count
  }
}

export { PolicyCategoryRepository }
