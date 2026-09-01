import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  EmployeeAttributeHistoryDTO,
  EmployeeDTO,
  EmployeeGroupMembershipDTO,
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
  SubtreeReadScope,
  TransactionManager,
  Tx,
} from "@policy/core"
import { EmployeeServiceInterface, UpdateEmployeeRecord } from "../interfaces/employee"
import {
  CreateEmployeeInput,
  ListEmployeesQuery,
  PatchEmployeeInput,
  ReplaceEmployeeInput,
} from "../validators"
import { AppError } from "@policy/core"
import {
  toAttributeHistoryDTO,
  toEmployeeDTO,
  toEmployeeGroupMembershipDTO,
} from "@policy/core"

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
 *
 * A `managerId` write does all four for up to THREE employees, not one: the
 * employee whose manager moved, the manager they left, and the manager they
 * joined. The last two never asked to be changed — their `isManager` flag is
 * derived from who reports to them, so a reassignment somewhere else in the
 * chart can flip it. `isManager` is a rule condition dimension, so a flip has to
 * reconcile like any other attribute change.
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
    const managerId = data.managerId ?? null

    const employee = await this.transactions.run(async (tx) => {

      if (managerId) {

        // No cycle check is possible or needed here: an employee that does not
        // exist yet has no subtree for a manager to be hiding in.
        await this.requireEligibleManager(organizationId, null, managerId, tx)
      }

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
          managerId,
          // Derived, not authored. A brand-new employee has nobody reporting to
          // them yet, whatever the request said.
          isManager: false,
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

      // The new manager has gained a report and may have just become one.
      await this.syncManagerFlags(
        organizationId,
        actorId,
        [managerId],
        effectiveFrom,
        tx,
      )

      return created
    })

    return toEmployeeDTO(employee)
  }

  /**
   * The collection read.
   *
   * `scope` is how a role-narrowed caller reaches the query. A MANAGER may only
   * see their own org-chart subtree, so the controller resolves their root and
   * this expands it into the id set the WHERE clause is confined to. The filter
   * goes into the query rather than trimming the result afterwards, so `total`
   * counts what the caller may actually see and paging stays honest.
   */
  async list(
    organizationId: string,
    query: ListEmployeesQuery,
    scope: SubtreeReadScope | null = null,
  ): Promise<Page<EmployeeDTO>> {

    const options = scope
      ? {
          ...query,
          employeeIds: await this.employees.findSubtreeIds(
            organizationId,
            scope.rootEmployeeId,
          ),
        }
      : query

    const [rows, total] = await Promise.all([
      this.employees.findMany(organizationId, options),
      this.employees.count(organizationId, options),
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
      // PUT clears what it does not mention, and that has to include the org
      // chart edge: an omitted `managerId` unparents the employee.
      managerId: data.managerId ?? null,
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

    // `isManager` is dropped here rather than passed through: it is derived from
    // `managerId` and recomputed below, so an authored value would only ever be
    // a chance to contradict the org chart.
    const { effectiveFrom, hireDate, isManager: _ignored, ...rest } = data

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
   *
   * The org chart is deliberately left alone in BOTH directions:
   *
   *   * Terminating a manager does NOT touch their reports. Every report keeps
   *     `manager_id` pointing at the person who managed them, because that is
   *     what was true, and rewriting it would erase the history the termination
   *     exists to preserve. The reports simply now report to someone who has
   *     left. Who they report to NEXT is a decision for whoever makes it — there
   *     is no automatic reassignment, and inventing one (to the manager's
   *     manager, say) would silently restructure a company's org chart on a
   *     departure.
   *
   *   * The terminated employee keeps their own `manager_id` too, for the same
   *     reason.
   *
   * DECISION: the one derived value that IS recomputed is `isManager` for the
   * MANAGER OF the terminated employee. `isManager` means "at least one ACTIVE
   * report", so a manager whose last report just left is no longer one — leaving
   * the flag set would put it out of step with the column it is derived from and
   * keep matching `isManager` rules against a manager of nobody. The terminated
   * employee's own flag is left as it stands: people still report to them, and
   * they are excluded from resolution regardless.
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

      await this.syncManagerFlags(
        organizationId,
        actorId,
        [employee.managerId],
        terminatedOn,
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

  async getGroups(
    organizationId: string,
    id: string,
    asOfInput?: string,
  ): Promise<EmployeeGroupMembershipDTO[]> {

    await this.requireEmployee(organizationId, id)

    const asOf = fromIsoDate(asOfInput ?? todayIsoDate())

    const rows = await this.groups.findMembershipsForEmployee(id, asOf)

    return rows.map(toEmployeeGroupMembershipDTO)
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

    // `isManager` is never taken from the request. It is recomputed from the
    // employee's actual direct reports on every write, which both maintains the
    // invariant the schema states (`manager_id` is the source of truth) and
    // heals a row that has somehow drifted. Reassigning THIS employee's manager
    // cannot change how many people report to THEM, so the count is stable
    // across the update and is safe to take before the transaction opens.
    const derivedIsManager =
      (await this.employees.countDirectReports(organizationId, id)) > 0

    const patchWithDerived: UpdateEmployeeRecord = {
      ...patch,
      isManager: derivedIsManager,
    }

    const managerChanged =
      patchWithDerived.managerId !== undefined &&
      (patchWithDerived.managerId ?? null) !== before.managerId

    const changes = this.diffAttributes(before, patchWithDerived)

    const after = await this.transactions.run(async (tx) => {

      if (managerChanged && patchWithDerived.managerId) {

        await this.requireEligibleManager(
          organizationId,
          id,
          patchWithDerived.managerId,
          tx,
        )
      }

      const updated = await this.employees.update(organizationId, id, patchWithDerived, tx)

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

      // The two employees on either side of a moved reporting edge. Neither was
      // named in the request; both may have just gained or lost their last
      // direct report, and `isManager` is a rule dimension.
      if (managerChanged) {

        await this.syncManagerFlags(
          organizationId,
          actorId,
          [before.managerId, patchWithDerived.managerId ?? null],
          effectiveFrom,
          tx,
        )
      }

      return row
    })

    return toEmployeeDTO(after)
  }

  /**
   * Whether `managerId` may be set as `employeeId`'s manager.
   *
   * Four ways to fail, and the fourth is the interesting one:
   *
   *   1. the manager does not exist in this organization — the read is
   *      org-scoped, so a valid id from another tenant is simply not found;
   *   2. the manager IS the employee. The database also refuses this, via the
   *      `employees_not_own_manager_chk` CHECK constraint, but a CHECK produces a
   *      driver error rather than an explainable one, so it is caught here first;
   *   3. the manager has been terminated. A departure does not rewrite existing
   *      edges (see `terminate`), but nobody may be newly assigned to report to
   *      someone who has left;
   *   4. the manager already sits somewhere inside the employee's own subtree,
   *      which would close a loop: A -> B -> A, or any longer chain.
   *
   * (4) is why cycle prevention lives here and not in the database. A row-level
   * CHECK constraint sees one row and cannot follow `manager_id` to another, so
   * the deepest cycle it can see is the length-1 one in (2). Catching the rest
   * needs a walk over other rows — `isInSubtree` — which is a query, and a query
   * is not something a constraint may run. The alternative, a deferred
   * constraint trigger, would move the same walk into the database while making
   * the failure far harder to explain to the person who typed the request.
   *
   * `employeeId` is null when creating: there is no subtree yet, so only the
   * first three checks apply.
   */
  private async requireEligibleManager(
    organizationId: string,
    employeeId: string | null,
    managerId: string,
    tx: Tx,
  ): Promise<void> {

    if (employeeId && managerId === employeeId) {

      throw new AppError(
        "An employee cannot report to themselves",
        422,
        ERROR_CODES.INVALID_MANAGER,
      )
    }

    const manager = await this.employees.findById(organizationId, managerId, tx)

    if (!manager) {

      throw new AppError(
        "The specified manager does not exist in this organization",
        422,
        ERROR_CODES.INVALID_MANAGER,
      )
    }

    if (manager.status === "TERMINATED") {

      throw new AppError(
        "The specified manager has been terminated and cannot take new reports",
        422,
        ERROR_CODES.INVALID_MANAGER,
      )
    }

    if (!employeeId) {

      return
    }

    const wouldCycle = await this.employees.isInSubtree(
      organizationId,
      employeeId,
      managerId,
      tx,
    )

    if (wouldCycle) {

      throw new AppError(
        "The specified manager already reports to this employee, directly or indirectly",
        409,
        ERROR_CODES.MANAGER_CYCLE,
      )
    }
  }

  /**
   * Recomputes `isManager` for employees on the ends of a moved reporting edge.
   *
   * Called with the old manager, the new manager, or both — nulls and duplicates
   * are dropped, so a caller does not have to work out which of the two actually
   * exists. Nothing is written for a manager whose flag did not move.
   *
   * When it DOES move, this is a tracked attribute change on somebody who was
   * not the subject of the request, so it gets the full treatment: history,
   * audit, and an outbox row. Skipping the outbox would be the real bug —
   * `isManager` is a rule condition dimension, so a manager who just crossed the
   * threshold may now match ("managers must complete additional training") and
   * one who just lost their last report may now stop matching.
   */
  private async syncManagerFlags(
    organizationId: string,
    actorId: string,
    managerIds: readonly (string | null)[],
    effectiveFrom: Date,
    tx: Tx,
  ): Promise<void> {

    const unique = [...new Set(managerIds.filter((value): value is string => Boolean(value)))]

    for (const managerId of unique) {

      const before = await this.employees.findById(organizationId, managerId, tx)

      if (!before) {

        continue
      }

      const reports = await this.employees.countDirectReports(organizationId, managerId, tx)
      const isManager = reports > 0

      if (before.isManager === isManager) {

        continue
      }

      await this.employees.setIsManager(organizationId, managerId, isManager, tx)

      const change: AttributeChange = {
        attribute: "isManager",
        oldValue: String(before.isManager),
        newValue: String(isManager),
      }

      await this.writeHistory(managerId, [change], effectiveFrom, actorId, tx)

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
          entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
          entityId: managerId,
          beforeState: this.auditSnapshot(before),
          afterState: this.auditSnapshot({ ...before, isManager }),
          metadata: {
            changedAttributes: ["isManager"],
            effectiveFrom: toIsoDate(effectiveFrom),
            // Says why a row nobody edited changed: the org chart moved
            // underneath it.
            derivedFrom: "manager_id",
            directReports: reports,
          },
        },
        tx,
      )

      await this.outbox.enqueue(
        organizationId,
        {
          eventType: OUTBOX_EVENT_TYPES.EMPLOYEE_ATTRIBUTES_CHANGED,
          aggregateType: OUTBOX_AGGREGATE_TYPES.EMPLOYEE,
          aggregateId: managerId,
          payload: {
            employeeId: managerId,
            changedAttributes: ["isManager"],
            effectiveFrom: toIsoDate(effectiveFrom),
          },
        },
        tx,
      )
    }
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
      managerId: employee.managerId,
      isManager: employee.isManager,
      status: employee.status,
      terminatedOn: employee.terminatedOn ? toIsoDate(employee.terminatedOn) : null,
    }
  }
}
