import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  EmployeeAttributeHistoryDTO,
  EmployeeDTO,
  ERROR_CODES,
  OUTBOX_AGGREGATE_TYPES,
  OUTBOX_EVENT_TYPES,
  Page,
  TRACKED_EMPLOYEE_ATTRIBUTES,
  TrackedEmployeeAttribute,
  fromIsoDate,
  toIsoDate,
  todayIsoDate,
} from "@policy/shared"
import {
  AssignmentRepository,
  AuditEventRepository,
  Employee,
  EmployeeAttributeHistoryRepository,
  EmployeeGroupRepository,
  EmployeeRepository,
  OutboxEventRepository,
  TransactionManager,
  Tx,
} from "../repositories"
import { EmployeeServiceInterface, UpdateEmployeeRecord } from "../interfaces/employee"
import {
  CreateEmployeeInput,
  ListEmployeesQuery,
  PatchEmployeeInput,
  ReplaceEmployeeInput,
} from "../validators"
import { AppError } from "../utils/AppError"
import { toAttributeHistoryDTO, toEmployeeDTO } from "../utils/serialize"

/** One attribute that moved, with the values on each side of the change. */
interface AttributeChange {
  attribute: TrackedEmployeeAttribute
  oldValue: string | null
  newValue: string | null
}

/**
 * Employees.
 *
 * Every write here does four things in ONE transaction:
 *
 *   1. change the employee row;
 *   2. record the effective-dated attribute history behind the change;
 *   3. record an audit event;
 *   4. write an outbox row so reconciliation gets enqueued.
 *
 * Step 4 is why the transaction matters. Writing the job to a queue outside the
 * transaction would leave a window where the employee changed but the job was
 * lost — or where a job fired for a change that rolled back. The outbox makes the
 * state change and its job atomic; a relay (not built) drains the table.
 */
export class EmployeeService implements EmployeeServiceInterface {

  constructor(
    private transactions: TransactionManager,
    private employees: EmployeeRepository,
    private history: EmployeeAttributeHistoryRepository,
    private groups: EmployeeGroupRepository,
    private assignments: AssignmentRepository,
    private audit: AuditEventRepository,
    private outbox: OutboxEventRepository,
  ) {}

  async create(
    organizationId: string,
    actorId: string,
    data: CreateEmployeeInput,
  ): Promise<EmployeeDTO> {

    const duplicate = await this.employees.findByEmail(organizationId, data.email)

    if (duplicate) {

      throw new AppError(
        "An employee with this email already exists in this organization",
        409,
        ERROR_CODES.ALREADY_EXISTS,
      )
    }

    // Initial attribute values are effective from the hire date unless the caller
    // says otherwise — they were true from the day the person was hired, not from
    // the day the record happened to be typed in.
    const effectiveFrom = fromIsoDate(data.effectiveFrom ?? data.hireDate)

    const employee = await this.transactions.run(async (tx) => {

      const created = await this.employees.create(
        organizationId,
        {
          name: data.name,
          email: data.email,
          hireDate: fromIsoDate(data.hireDate),
          employmentType: data.employmentType,
          department: data.department ?? null,
          role: data.role ?? null,
          location: data.location ?? null,
          state: data.state ?? null,
          country: data.country ?? null,
          isManager: data.isManager ?? false,
        },
        tx,
      )

      const seeded = TRACKED_EMPLOYEE_ATTRIBUTES.map((attribute) => ({
        attribute,
        oldValue: null,
        newValue: this.readAttribute(created, attribute),
      })).filter((change) => change.newValue !== null)

      await this.writeHistory(created.id, seeded, effectiveFrom, actorId, tx)

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.EMPLOYEE_CREATED,
          entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
          entityId: created.id,
          afterState: this.auditSnapshot(created),
        },
        tx,
      )

      await this.outbox.enqueue(
        organizationId,
        {
          eventType: OUTBOX_EVENT_TYPES.EMPLOYEE_CREATED,
          aggregateType: OUTBOX_AGGREGATE_TYPES.EMPLOYEE,
          aggregateId: created.id,
          payload: {
            employeeId: created.id,
            effectiveFrom: toIsoDate(effectiveFrom),
          },
        },
        tx,
      )

      return created
    })

    return toEmployeeDTO(employee)
  }

  async list(organizationId: string, query: ListEmployeesQuery): Promise<Page<EmployeeDTO>> {

    const [rows, total] = await Promise.all([
      this.employees.findMany(organizationId, query),
      this.employees.count(organizationId, query),
    ])

    return {
      items: rows.map((row) => toEmployeeDTO(row)),
      total,
      limit: query.limit,
      offset: query.offset,
    }
  }

  async getById(organizationId: string, id: string): Promise<EmployeeDTO> {

    return toEmployeeDTO(await this.requireEmployee(organizationId, id))
  }

  /** PUT: attributes absent from the body are cleared. */
  async replace(
    organizationId: string,
    actorId: string,
    id: string,
    data: ReplaceEmployeeInput,
  ): Promise<EmployeeDTO> {

    const patch: UpdateEmployeeRecord = {
      name: data.name,
      email: data.email,
      hireDate: fromIsoDate(data.hireDate),
      employmentType: data.employmentType,
      department: data.department ?? null,
      role: data.role ?? null,
      location: data.location ?? null,
      state: data.state ?? null,
      country: data.country ?? null,
      isManager: data.isManager ?? false,
    }

    return this.applyUpdate(organizationId, actorId, id, patch, data.effectiveFrom)
  }

  /** PATCH: only the keys present are touched. */
  async patch(
    organizationId: string,
    actorId: string,
    id: string,
    data: PatchEmployeeInput,
  ): Promise<EmployeeDTO> {

    const { effectiveFrom, hireDate, ...rest } = data

    const patch: UpdateEmployeeRecord = {
      ...rest,
      ...(hireDate !== undefined && { hireDate: fromIsoDate(hireDate) }),
    }

    return this.applyUpdate(organizationId, actorId, id, patch, effectiveFrom)
  }

  /**
   * Termination — what `DELETE /employees/:id` does.
   *
   * Deleting an employee row would take the assignments, resolution events and
   * attribute history with it, and an assignment that cannot name the person it
   * applied to cannot be explained. So the row stays and the employment ends:
   * status flips, the termination date is recorded, and every open group
   * membership and assignment is end-dated on the same day.
   *
   * From that day on the employee is excluded from resolution entirely.
   */
  async terminate(
    organizationId: string,
    actorId: string,
    id: string,
    terminatedOnInput?: string,
  ): Promise<EmployeeDTO> {

    const employee = await this.requireEmployee(organizationId, id)

    if (employee.status === "TERMINATED") {

      throw new AppError(
        "This employee has already been terminated",
        409,
        ERROR_CODES.CONFLICT,
      )
    }

    const terminatedOn = fromIsoDate(terminatedOnInput ?? todayIsoDate())

    const after = await this.transactions.run(async (tx) => {

      const terminated = await this.employees.terminate(organizationId, id, terminatedOn, tx)

      if (terminated === 0) {

        throw new AppError("Employee not found", 404, ERROR_CODES.NOT_FOUND)
      }

      // Everything derived from employment ends with it, on the same calendar
      // day. `effectiveTo` is exclusive, so the last day the employee held these
      // is the day before the termination date.
      const memberships = await this.groups.endAllOpenForEmployee(id, terminatedOn, tx)
      const assignments = await this.assignments.closeAllOpenForEmployee(
        organizationId,
        id,
        terminatedOn,
        tx,
      )

      const row = await this.employees.findById(organizationId, id, tx)

      if (!row) {

        throw new AppError("Employee not found", 404, ERROR_CODES.NOT_FOUND)
      }

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.EMPLOYEE_TERMINATED,
          entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
          entityId: id,
          beforeState: this.auditSnapshot(employee),
          afterState: this.auditSnapshot(row),
          metadata: {
            terminatedOn: toIsoDate(terminatedOn),
            endedGroupMemberships: memberships,
            endedAssignments: assignments,
          },
        },
        tx,
      )

      await this.outbox.enqueue(
        organizationId,
        {
          eventType: OUTBOX_EVENT_TYPES.EMPLOYEE_TERMINATED,
          aggregateType: OUTBOX_AGGREGATE_TYPES.EMPLOYEE,
          aggregateId: id,
          payload: {
            employeeId: id,
            terminatedOn: toIsoDate(terminatedOn),
          },
        },
        tx,
      )

      return row
    })

    return toEmployeeDTO(after)
  }

  async getAttributeHistory(
    organizationId: string,
    id: string,
  ): Promise<EmployeeAttributeHistoryDTO[]> {

    // Resolving the employee within the organization first is what scopes this
    // read — `employee_attribute_history` carries no organization column of its
    // own.
    await this.requireEmployee(organizationId, id)

    const rows = await this.history.findForEmployee(id)

    return rows.map(toAttributeHistoryDTO)
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async requireEmployee(organizationId: string, id: string): Promise<Employee> {

    const employee = await this.employees.findById(organizationId, id)

    if (!employee) {

      throw new AppError("Employee not found", 404, ERROR_CODES.NOT_FOUND)
    }

    return employee
  }

  /**
   * The shared write path for PUT and PATCH.
   *
   * The attribute diff is computed against the row as it stands, so a request
   * that sets a field to the value it already holds produces no history row, no
   * audit noise and no reconciliation job.
   */
  private async applyUpdate(
    organizationId: string,
    actorId: string,
    id: string,
    patch: UpdateEmployeeRecord,
    effectiveFromInput: string | undefined,
  ): Promise<EmployeeDTO> {

    const before = await this.requireEmployee(organizationId, id)

    if (patch.email && patch.email !== before.email) {

      const duplicate = await this.employees.findByEmail(organizationId, patch.email)

      if (duplicate) {

        throw new AppError(
          "An employee with this email already exists in this organization",
          409,
          ERROR_CODES.ALREADY_EXISTS,
        )
      }
    }

    const effectiveFrom = fromIsoDate(effectiveFromInput ?? todayIsoDate())
    const changes = this.diffAttributes(before, patch)

    const after = await this.transactions.run(async (tx) => {

      const updated = await this.employees.update(organizationId, id, patch, tx)

      if (updated === 0) {

        throw new AppError("Employee not found", 404, ERROR_CODES.NOT_FOUND)
      }

      const row = await this.employees.findById(organizationId, id, tx)

      if (!row) {

        throw new AppError("Employee not found", 404, ERROR_CODES.NOT_FOUND)
      }

      if (changes.length > 0) {

        await this.writeHistory(id, changes, effectiveFrom, actorId, tx)
      }

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
          entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
          entityId: id,
          beforeState: this.auditSnapshot(before),
          afterState: this.auditSnapshot(row),
          metadata: {
            changedAttributes: changes.map((change) => change.attribute),
            effectiveFrom: toIsoDate(effectiveFrom),
          },
        },
        tx,
      )

      // Only an attribute that a rule could match on is worth reconciling. A
      // name or email edit changes nothing about which policies apply, so it
      // enqueues nothing.
      if (changes.length > 0) {

        await this.outbox.enqueue(
          organizationId,
          {
            eventType: OUTBOX_EVENT_TYPES.EMPLOYEE_ATTRIBUTES_CHANGED,
            aggregateType: OUTBOX_AGGREGATE_TYPES.EMPLOYEE,
            aggregateId: id,
            payload: {
              employeeId: id,
              // The worker uses this to narrow the rule fan-out to the rules
              // that actually depend on what moved.
              changedAttributes: changes.map((change) => change.attribute),
              effectiveFrom: toIsoDate(effectiveFrom),
            },
          },
          tx,
        )
      }

      return row
    })

    return toEmployeeDTO(after)
  }

  /**
   * Closes the open history row for each changed attribute and opens a new one.
   *
   * Closing at the same date the new row opens keeps the ranges adjacent and
   * non-overlapping under the system's half-open predicate
   * (`effective_to` is exclusive), so exactly one value is in force on any day.
   */
  private async writeHistory(
    employeeId: string,
    changes: AttributeChange[],
    effectiveFrom: Date,
    actorId: string,
    tx: Tx,
  ): Promise<void> {

    const attributes = changes.map((change) => change.attribute)

    await this.history.closeOpenRows(employeeId, attributes, effectiveFrom, tx)

    const rows = changes.map((change) => ({
      employeeId,
      attribute: change.attribute,
      oldValue: change.oldValue,
      newValue: change.newValue,
      effectiveFrom,
      effectiveTo: null,
      changedBy: actorId,
    }))

    await this.history.createMany(rows, tx)
  }

  /** Which tracked attributes this patch actually moves. */
  private diffAttributes(before: Employee, patch: UpdateEmployeeRecord): AttributeChange[] {

    const changes: AttributeChange[] = []

    for (const attribute of TRACKED_EMPLOYEE_ATTRIBUTES) {

      if (!(attribute in patch)) {

        continue
      }

      const oldValue = this.readAttribute(before, attribute)
      const newValue = this.stringify(patch[attribute as keyof UpdateEmployeeRecord])

      if (oldValue !== newValue) {

        changes.push({ attribute, oldValue, newValue })
      }
    }

    return changes
  }

  /** Reads one tracked attribute off an employee row as a comparable string. */
  private readAttribute(
    employee: Employee,
    attribute: TrackedEmployeeAttribute,
  ): string | null {

    return this.stringify(employee[attribute as keyof Employee])
  }

  /**
   * History stores values as text so one table can hold every attribute.
   * Dates normalize to `YYYY-MM-DD` and booleans to "true"/"false" so that a
   * comparison never depends on how the value was spelled.
   */
  private stringify(value: unknown): string | null {

    if (value === null || value === undefined) {

      return null
    }

    if (value instanceof Date) {

      return toIsoDate(value)
    }

    return String(value)
  }

  /** The before/after payload written into the audit trail. */
  private auditSnapshot(employee: Employee) {

    return {
      name: employee.name,
      email: employee.email,
      hireDate: toIsoDate(employee.hireDate),
      employmentType: employee.employmentType,
      department: employee.department,
      role: employee.role,
      location: employee.location,
      state: employee.state,
      country: employee.country,
      isManager: employee.isManager,
      status: employee.status,
      terminatedOn: employee.terminatedOn ? toIsoDate(employee.terminatedOn) : null,
    }
  }
}
