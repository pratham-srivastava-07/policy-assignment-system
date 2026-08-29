import { OrganizationMembership, OrganizationRole, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"

/**
 * The join between a global user identity and an organization, carrying the
 * role the user holds there.
 *
 * This table is what the auth layer consults to decide which organization a
 * session may act in — the organization is never taken from client input.
 */
class OrganizationMembershipRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  async create(
    data: {
      userId: string
      organizationId: string
      role: OrganizationRole
    },
    tx?: TxClient,
  ): Promise<OrganizationMembership> {

    return this.db(tx).organizationMembership.create({
      data,
    })
  }

  async findForUser(userId: string, tx?: TxClient): Promise<OrganizationMembership[]> {

    return this.db(tx).organizationMembership.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "asc",
      },
    })
  }

  async findOne(
    userId: string,
    organizationId: string,
    tx?: TxClient,
  ): Promise<OrganizationMembership | null> {

    return this.db(tx).organizationMembership.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    })
  }

  async findAllInOrganization(
    organizationId: string,
    tx?: TxClient,
  ): Promise<OrganizationMembership[]> {

    return this.db(tx).organizationMembership.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: "asc",
      },
    })
  }

  async updateRole(
    userId: string,
    organizationId: string,
    role: OrganizationRole,
    tx?: TxClient,
  ): Promise<OrganizationMembership> {

    return this.db(tx).organizationMembership.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      data: {
        role,
      },
    })
  }

  async delete(
    userId: string,
    organizationId: string,
    tx?: TxClient,
  ): Promise<OrganizationMembership> {

    return this.db(tx).organizationMembership.delete({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    })
  }
}

export { OrganizationMembershipRepository }
