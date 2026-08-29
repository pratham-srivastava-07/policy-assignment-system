import { PrismaClass, User } from "@policy/db"
import { TxClient } from "../interfaces/db"
import { CreateUserRecord, UpdateUserRecord } from "../interfaces/user"

/**
 * Users are global identities — the same person can hold memberships in several
 * organizations — so the table itself carries no `organization_id`.
 *
 * Every read here is therefore scoped through `organization_memberships`. The
 * `organizationId` argument always originates from the authenticated session.
 */
class UserRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  async create(data: CreateUserRecord, tx?: TxClient): Promise<User> {

    return this.db(tx).user.create({
      data,
    })
  }

  /**
   * Global lookup by email — used by login, which has no organization context
   * yet. Not exposed through any org-scoped endpoint.
   */
  async findByEmail(email: string, tx?: TxClient): Promise<User | null> {

    return this.db(tx).user.findUnique({
      where: {
        email,
      },
    })
  }

  /** Global lookup by id — used by the auth middleware after a session hit. */
  async findById(id: string, tx?: TxClient): Promise<User | null> {

    return this.db(tx).user.findUnique({
      where: {
        id,
      },
    })
  }

  async findByIdInOrganization(
    organizationId: string,
    id: string,
    tx?: TxClient,
  ): Promise<User | null> {

    return this.db(tx).user.findFirst({
      where: {
        id,
        memberships: {
          some: {
            organizationId,
          },
        },
      },
    })
  }

  async findByEmailInOrganization(
    organizationId: string,
    email: string,
    tx?: TxClient,
  ): Promise<User | null> {

    return this.db(tx).user.findFirst({
      where: {
        email,
        memberships: {
          some: {
            organizationId,
          },
        },
      },
    })
  }

  async findAllInOrganization(
    organizationId: string,
    options: { limit: number; offset: number },
    tx?: TxClient,
  ): Promise<User[]> {

    return this.db(tx).user.findMany({
      where: {
        memberships: {
          some: {
            organizationId,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: options.limit,
      skip: options.offset,
    })
  }

  async countInOrganization(organizationId: string, tx?: TxClient): Promise<number> {

    return this.db(tx).user.count({
      where: {
        memberships: {
          some: {
            organizationId,
          },
        },
      },
    })
  }

  async update(id: string, data: UpdateUserRecord, tx?: TxClient): Promise<User> {

    return this.db(tx).user.update({
      where: {
        id,
      },
      data,
    })
  }

  async delete(id: string, tx?: TxClient): Promise<User> {

    return this.db(tx).user.delete({
      where: {
        id,
      },
    })
  }
}

export { UserRepository }
