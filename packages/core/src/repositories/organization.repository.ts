import { Organization, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"

/**
 * Organizations are the tenancy root, so this repository is the one place that
 * is NOT itself org-scoped — every other repository is.
 */
class OrganizationRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  async create(data: { name: string }, tx?: TxClient): Promise<Organization> {

    return this.db(tx).organization.create({
      data,
    })
  }

  async findById(id: string, tx?: TxClient): Promise<Organization | null> {

    return this.db(tx).organization.findUnique({
      where: {
        id,
      },
    })
  }
}

export { OrganizationRepository }
