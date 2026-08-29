import bcrypt from "bcrypt"
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  ERROR_CODES,
  PASSWORD_SALT_ROUNDS,
  Page,
  PublicUser,
} from "@policy/shared"
import {
  AuditEventRepository,
  EmployeeRepository,
  OrganizationMembershipRepository,
  TransactionManager,
  User,
  UserRepository,
} from "@policy/core"
import { UserServiceInterface } from "../interfaces/user"
import { CreateUserInput, ListUsersQuery, UpdateUserInput } from "../validators"
import { AppError } from "@policy/core"
import { toPublicUser } from "@policy/core"

/**
 * Users — login identities, as opposed to employees, who are workforce records.
 * A user may optionally point at one employee.
 *
 * The table has no `organization_id`: a user is global and reaches an
 * organization through `organization_memberships`. Every method here therefore
 * takes the caller's `organizationId` (from the session) and scopes through that
 * join, so a user id belonging to another tenant simply does not resolve.
 */
export class UserService implements UserServiceInterface {

  constructor(
    private transactions: TransactionManager,
    private users: UserRepository,
    private memberships: OrganizationMembershipRepository,
    private employees: EmployeeRepository,
    private audit: AuditEventRepository,
  ) {}

  /** Adds a teammate to the CALLER's organization. */
  async createUser(
    organizationId: string,
    actorId: string,
    data: CreateUserInput,
  ): Promise<PublicUser> {

    const existing = await this.users.findByEmail(data.email)

    if (existing) {

      throw new AppError(
        "An account with this email already exists",
        409,
        ERROR_CODES.ALREADY_EXISTS,
      )
    }

    if (data.employeeId) {

      await this.requireEmployeeInOrganization(organizationId, data.employeeId)
    }

    const passwordHash = await bcrypt.hash(data.password, PASSWORD_SALT_ROUNDS)

    const user = await this.transactions.run(async (tx) => {

      const created = await this.users.create(
        {
          name: data.name,
          email: data.email,
          passwordHash,
          employeeId: data.employeeId ?? null,
        },
        tx,
      )

      await this.memberships.create(
        {
          userId: created.id,
          organizationId,
          role: data.role,
        },
        tx,
      )

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.USER_CREATED,
          entityType: AUDIT_ENTITY_TYPES.USER,
          entityId: created.id,
          afterState: { email: created.email, name: created.name, role: data.role },
        },
        tx,
      )

      return created
    })

    return toPublicUser(user)
  }

  async listUsers(
    organizationId: string,
    query: ListUsersQuery,
  ): Promise<Page<PublicUser>> {

    const [rows, total] = await Promise.all([
      this.users.findAllInOrganization(organizationId, query),
      this.users.countInOrganization(organizationId),
    ])

    return {
      items: rows.map(toPublicUser),
      total,
      limit: query.limit,
      offset: query.offset,
    }
  }

  async getUserById(organizationId: string, id: string): Promise<PublicUser> {

    return toPublicUser(await this.requireUser(organizationId, id))
  }

  async findByEmail(organizationId: string, email: string): Promise<PublicUser> {

    const user = await this.users.findByEmailInOrganization(organizationId, email)

    if (!user) {

      throw new AppError("User not found", 404, ERROR_CODES.NOT_FOUND)
    }

    return toPublicUser(user)
  }

  async updateUser(
    organizationId: string,
    actorId: string,
    id: string,
    data: UpdateUserInput,
  ): Promise<PublicUser> {

    const before = await this.requireUser(organizationId, id)

    if (data.email && data.email !== before.email) {

      const duplicate = await this.users.findByEmail(data.email)

      if (duplicate) {

        throw new AppError(
          "An account with this email already exists",
          409,
          ERROR_CODES.ALREADY_EXISTS,
        )
      }
    }

    if (data.employeeId) {

      await this.requireEmployeeInOrganization(organizationId, data.employeeId)
    }

    const { password, ...rest } = data

    const patch = {
      ...rest,
      ...(password !== undefined && {
        passwordHash: await bcrypt.hash(password, PASSWORD_SALT_ROUNDS),
      }),
    }

    const after = await this.transactions.run(async (tx) => {

      const updated = await this.users.update(id, patch, tx)

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.USER_UPDATED,
          entityType: AUDIT_ENTITY_TYPES.USER,
          entityId: id,
          beforeState: { email: before.email, name: before.name, employeeId: before.employeeId },
          afterState: { email: updated.email, name: updated.name, employeeId: updated.employeeId },
          // Never record the password, hashed or otherwise.
          metadata: { passwordChanged: password !== undefined },
        },
        tx,
      )

      return updated
    })

    return toPublicUser(after)
  }

  async delete(organizationId: string, actorId: string, id: string): Promise<PublicUser> {

    const user = await this.requireUser(organizationId, id)

    await this.transactions.run(async (tx) => {

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.USER_DELETED,
          entityType: AUDIT_ENTITY_TYPES.USER,
          entityId: user.id,
          beforeState: { email: user.email, name: user.name },
        },
        tx,
      )

      // Cascades take the memberships and sessions with it, so the account is
      // logged out everywhere at once.
      await this.users.delete(id, tx)
    })

    return toPublicUser(user)
  }

  private async requireUser(organizationId: string, id: string): Promise<User> {

    const user = await this.users.findByIdInOrganization(organizationId, id)

    if (!user) {

      throw new AppError("User not found", 404, ERROR_CODES.NOT_FOUND)
    }

    return user
  }

  private async requireEmployeeInOrganization(
    organizationId: string,
    employeeId: string,
  ): Promise<void> {

    const employee = await this.employees.findById(organizationId, employeeId)

    if (!employee) {

      throw new AppError("Employee not found", 404, ERROR_CODES.NOT_FOUND)
    }
  }
}
