import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  ERROR_CODES,
  GroupDTO,
  GroupMemberDTO,
  OUTBOX_AGGREGATE_TYPES,
  OUTBOX_EVENT_TYPES,
  Page,
  fromIsoDate,
  toIsoDate,
  todayIsoDate,
} from "@policy/shared"
import {
  AuditEventRepository,
  EmployeeGroupRepository,
  EmployeeRepository,
  Group,
  GroupRepository,
  OutboxEventRepository,
  TransactionManager,
  Tx,
} from "../repositories"
import { GroupServiceInterface } from "../interfaces/group"
import {
  AddGroupMemberInput,
  CreateGroupInput,
  ListGroupMembersQuery,
  ListGroupsQuery,
  PatchGroupInput,
  ReplaceGroupInput,
} from "../validators"
import { AppError } from "../utils/AppError"
import { toGroupDTO, toGroupMemberDTO } from "../utils/serialize"

/**
 * Groups and their effective-dated membership.
 *
 * Membership is a rule dimension, so joining or leaving a group can change which
 * policies apply — every membership write therefore enqueues reconciliation in
 * the same transaction, exactly as an employee attribute change does.
 *
 * Leaving a group never deletes a row. It end-dates one, so "who was in this
 * group on 1 January" stays answerable.
 */
export class GroupService implements GroupServiceInterface {

  constructor(
    private transactions: TransactionManager,
    private groups: GroupRepository,
    private members: EmployeeGroupRepository,
    private employees: EmployeeRepository,
    private audit: AuditEventRepository,
    private outbox: OutboxEventRepository,
  ) {}

  async create(
    organizationId: string,
    actorId: string,
    data: CreateGroupInput,
  ): Promise<GroupDTO> {

    const duplicate = await this.groups.findByName(organizationId, data.name)

    if (duplicate) {

      throw new AppError(
        "A group with this name already exists",
        409,
        ERROR_CODES.ALREADY_EXISTS,
      )
    }

    const group = await this.transactions.run(async (tx) => {

      const created = await this.groups.create(
        organizationId,
        {
          name: data.name,
          description: data.description ?? null,
        },
        tx,
      )

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.GROUP_CREATED,
          entityType: AUDIT_ENTITY_TYPES.GROUP,
          entityId: created.id,
          afterState: { name: created.name, description: created.description },
        },
        tx,
      )

      return created
    })

    return toGroupDTO(group)
  }

  async list(organizationId: string, query: ListGroupsQuery): Promise<Page<GroupDTO>> {

    const [rows, total] = await Promise.all([
      this.groups.findMany(organizationId, query),
      this.groups.count(organizationId, query.search),
    ])

    return {
      items: rows.map(toGroupDTO),
      total,
      limit: query.limit,
      offset: query.offset,
    }
  }

  async getById(organizationId: string, id: string): Promise<GroupDTO> {

    return toGroupDTO(await this.requireGroup(organizationId, id))
  }

  /** PUT: an omitted description is cleared. */
  async replace(
    organizationId: string,
    actorId: string,
    id: string,
    data: ReplaceGroupInput,
  ): Promise<GroupDTO> {

    return this.applyUpdate(organizationId, actorId, id, {
      name: data.name,
      description: data.description ?? null,
    })
  }

  /** PATCH: only the keys present are touched. */
  async patch(
    organizationId: string,
    actorId: string,
    id: string,
    data: PatchGroupInput,
  ): Promise<GroupDTO> {

    return this.applyUpdate(organizationId, actorId, id, {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description ?? null }),
    })
  }

  async delete(organizationId: string, actorId: string, id: string): Promise<GroupDTO> {

    const group = await this.requireGroup(organizationId, id)

    await this.transactions.run(async (tx) => {

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.GROUP_DELETED,
          entityType: AUDIT_ENTITY_TYPES.GROUP,
          entityId: group.id,
          beforeState: { name: group.name, description: group.description },
        },
        tx,
      )

      // Deleting a group cascades its memberships away, so every employee who
      // was in it may now resolve differently.
      await this.outbox.enqueue(
        organizationId,
        {
          eventType: OUTBOX_EVENT_TYPES.GROUP_DELETED,
          aggregateType: OUTBOX_AGGREGATE_TYPES.GROUP,
          aggregateId: group.id,
          payload: {
            groupId: group.id,
          },
        },
        tx,
      )

      const deleted = await this.groups.delete(organizationId, id, tx)

      if (deleted === 0) {

        throw new AppError("Group not found", 404, ERROR_CODES.NOT_FOUND)
      }
    })

    return toGroupDTO(group)
  }

  /** Point-in-time roster, defaulting to today. */
  async listMembers(
    organizationId: string,
    id: string,
    query: ListGroupMembersQuery,
  ): Promise<Page<GroupMemberDTO>> {

    await this.requireGroup(organizationId, id)

    const asOf = fromIsoDate(query.asOf ?? todayIsoDate())

    const [rows, total] = await Promise.all([
      this.members.findMembers(id, asOf, query),
      this.members.countMembers(id, asOf),
    ])

    return {
      items: rows.map(toGroupMemberDTO),
      total,
      limit: query.limit,
      offset: query.offset,
    }
  }

  async addMember(
    organizationId: string,
    actorId: string,
    id: string,
    data: AddGroupMemberInput,
  ): Promise<GroupMemberDTO> {

    // Both sides are resolved through org-scoped reads first: `employee_groups`
    // carries no organization column, so this is what stops a group in one tenant
    // being joined to an employee in another.
    await this.requireGroup(organizationId, id)

    const employee = await this.employees.findById(organizationId, data.employeeId)

    if (!employee) {

      throw new AppError("Employee not found", 404, ERROR_CODES.NOT_FOUND)
    }

    const effectiveFrom = fromIsoDate(data.effectiveFrom ?? todayIsoDate())
    const existing = await this.members.findEffective(id, employee.id, effectiveFrom)

    if (existing) {

      throw new AppError(
        "This employee is already a member of the group on that date",
        409,
        ERROR_CODES.ALREADY_EXISTS,
      )
    }

    const membership = await this.transactions.run(async (tx) => {

      const created = await this.members.create(
        {
          employeeId: employee.id,
          groupId: id,
          effectiveFrom,
          effectiveTo: null,
        },
        tx,
      )

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.GROUP_MEMBER_ADDED,
          entityType: AUDIT_ENTITY_TYPES.EMPLOYEE_GROUP,
          entityId: created.id,
          afterState: {
            groupId: id,
            employeeId: employee.id,
            effectiveFrom: toIsoDate(effectiveFrom),
          },
        },
        tx,
      )

      await this.enqueueMembershipChange(organizationId, id, employee.id, effectiveFrom, tx)

      return created
    })

    return toGroupMemberDTO({
      ...membership,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
      },
    })
  }

  /**
   * Removal end-dates the membership. `effectiveTo` is exclusive, so the default
   * of today means "not a member as of today".
   */
  async removeMember(
    organizationId: string,
    actorId: string,
    id: string,
    employeeId: string,
    effectiveToInput?: string,
  ): Promise<GroupMemberDTO> {

    await this.requireGroup(organizationId, id)

    const employee = await this.employees.findById(organizationId, employeeId)

    if (!employee) {

      throw new AppError("Employee not found", 404, ERROR_CODES.NOT_FOUND)
    }

    const effectiveTo = fromIsoDate(effectiveToInput ?? todayIsoDate())
    const membership = await this.members.findEffective(id, employeeId, effectiveTo)

    if (!membership) {

      throw new AppError(
        "This employee is not a member of the group on that date",
        404,
        ERROR_CODES.NOT_FOUND,
      )
    }

    const closed = await this.transactions.run(async (tx) => {

      const updated = await this.members.endMembership(membership.id, effectiveTo, tx)

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.GROUP_MEMBER_REMOVED,
          entityType: AUDIT_ENTITY_TYPES.EMPLOYEE_GROUP,
          entityId: membership.id,
          beforeState: {
            groupId: id,
            employeeId,
            effectiveFrom: toIsoDate(membership.effectiveFrom),
            effectiveTo: membership.effectiveTo ? toIsoDate(membership.effectiveTo) : null,
          },
          afterState: {
            groupId: id,
            employeeId,
            effectiveFrom: toIsoDate(membership.effectiveFrom),
            effectiveTo: toIsoDate(effectiveTo),
          },
        },
        tx,
      )

      await this.enqueueMembershipChange(organizationId, id, employeeId, effectiveTo, tx)

      return updated
    })

    return toGroupMemberDTO({
      ...closed,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
      },
    })
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async requireGroup(organizationId: string, id: string): Promise<Group> {

    const group = await this.groups.findById(organizationId, id)

    if (!group) {

      throw new AppError("Group not found", 404, ERROR_CODES.NOT_FOUND)
    }

    return group
  }

  private async applyUpdate(
    organizationId: string,
    actorId: string,
    id: string,
    patch: { name?: string; description?: string | null },
  ): Promise<GroupDTO> {

    const before = await this.requireGroup(organizationId, id)

    if (patch.name && patch.name !== before.name) {

      const duplicate = await this.groups.findByName(organizationId, patch.name)

      if (duplicate) {

        throw new AppError(
          "A group with this name already exists",
          409,
          ERROR_CODES.ALREADY_EXISTS,
        )
      }
    }

    const after = await this.transactions.run(async (tx) => {

      const updated = await this.groups.update(organizationId, id, patch, tx)

      if (updated === 0) {

        throw new AppError("Group not found", 404, ERROR_CODES.NOT_FOUND)
      }

      const row = await this.groups.findById(organizationId, id, tx)

      if (!row) {

        throw new AppError("Group not found", 404, ERROR_CODES.NOT_FOUND)
      }

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.GROUP_UPDATED,
          entityType: AUDIT_ENTITY_TYPES.GROUP,
          entityId: id,
          beforeState: { name: before.name, description: before.description },
          afterState: { name: row.name, description: row.description },
        },
        tx,
      )

      // A group's name and description do not participate in rule evaluation —
      // only membership does — so nothing is enqueued here.
      return row
    })

    return toGroupDTO(after)
  }

  /**
   * The affected population of a membership change is exactly one employee, so
   * the outbox row is keyed on the employee rather than the group.
   */
  private async enqueueMembershipChange(
    organizationId: string,
    groupId: string,
    employeeId: string,
    effectiveFrom: Date,
    tx: Tx,
  ): Promise<void> {

    await this.outbox.enqueue(
      organizationId,
      {
        eventType: OUTBOX_EVENT_TYPES.GROUP_MEMBERSHIP_CHANGED,
        aggregateType: OUTBOX_AGGREGATE_TYPES.EMPLOYEE,
        aggregateId: employeeId,
        payload: {
          employeeId,
          groupId,
          effectiveFrom: toIsoDate(effectiveFrom),
        },
      },
      tx,
    )
  }
}
