import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AssignmentDTO,
  AssignmentExplanationDTO,
  CategoryResolutionDTO,
  ERROR_CODES,
  Page,
  PreviewDTO,
  ReconciliationResultDTO,
  ResolutionDTO,
  ResolutionTrailEntryDTO,
  ResolvedPolicyDTO,
  RuleConditions,
  fromIsoDate,
  toIsoDate,
  todayIsoDate,
} from "@policy/shared"
import {
  Assignment,
  AssignmentRepository,
  AssignmentWithContext,
  AssignmentResolutionEventRepository,
  AuditEventRepository,
  CreateResolutionEventRecord,
  Employee,
  EmployeeGroupRepository,
  EmployeeRepository,
  PolicyRuleRepository,
  PolicyRuleWithPolicy,
  ResolutionEventWithRule,
  TransactionManager,
  Tx,
} from "../repositories"
import { ResolutionServiceInterface } from "../interfaces/assignment"
import {
  EmployeeAssignmentsQuery,
  ListAssignmentsQuery,
  PreviewEmployeeInput,
  ReconcileEmployeeInput,
} from "../validators"
import { AppError } from "../utils/AppError"
import {
  toAssignmentDTO,
  toResolvedPolicyDTO,
  toRuleVersionDTO,
  toTrailEntryDTO,
} from "../utils/serialize"
import {
  EngineEmployee,
  EngineRule,
  ResolutionResult,
  ResolvedPolicy,
  resolve,
} from "../engine"

/** The hypothetical attributes a preview may substitute. */
type EmployeeOverrides = PreviewEmployeeInput["changes"]

/**
 * Materialization — the layer between the pure engine and the database.
 *
 * The engine says what SHOULD be true. This decides what to write so that what
 * IS true matches, and it does so by difference rather than by replacement:
 *
 *     desired (engine)  vs  current (assignments effective on the as-of day)
 *
 *     in both      -> left alone, not touched, not rewritten
 *     only current -> end-dated on the as-of day
 *     only desired -> created, effective from the as-of day
 *
 * That is what makes reconciliation idempotent. A second run recomputes the same
 * desired set; the rows it would have added are now current and match, the rows
 * it would have removed are already closed and no longer current, so the
 * difference is empty and nothing is written. Retrying a job cannot corrupt the
 * state, which matters because distributed queues retry.
 *
 * The identity of an assignment, for the purposes of that comparison, is
 * (policy, source rule, source rule VERSION). Including the version is
 * deliberate: when a rule is edited the explanation changes even if the policy
 * does not, so the old assignment is closed and a new one opened against the new
 * rule text. Assignments are never rewritten in place.
 */
export class ResolutionService implements ResolutionServiceInterface {

  constructor(
    private transactions: TransactionManager,
    private employees: EmployeeRepository,
    private groups: EmployeeGroupRepository,
    private rules: PolicyRuleRepository,
    private assignments: AssignmentRepository,
    private events: AssignmentResolutionEventRepository,
    private audit: AuditEventRepository,
  ) {}

  async listForEmployee(
    organizationId: string,
    employeeId: string,
    query: EmployeeAssignmentsQuery,
  ): Promise<Page<AssignmentDTO>> {

    await this.requireEmployee(organizationId, employeeId)

    const asOf = fromIsoDate(query.asOf ?? todayIsoDate())

    const rows = await this.assignments.findForEmployeeAsOf(organizationId, employeeId, asOf)

    return this.page(rows.map(toAssignmentDTO), query)
  }

  async listForEmployees(
    organizationId: string,
    query: ListAssignmentsQuery,
  ): Promise<Page<AssignmentDTO>> {

    const asOf = fromIsoDate(query.asOf ?? todayIsoDate())

    // One query for the whole batch. The employee ids are filtered by the
    // organization inside the repository, so an id from another tenant simply
    // contributes nothing rather than leaking a row.
    const rows = await this.assignments.findForEmployeesAsOf(
      organizationId,
      query.employeeIds,
      asOf,
    )

    return this.page(rows.map(toAssignmentDTO), query)
  }

  /**
   * "Why does this assignment exist?"
   *
   * Three things come back: the assignment, the rule text as it stood when the
   * assignment was made, and every rule considered in that same evaluation —
   * including the ones that matched and lost. The trail is tied together by the
   * instant the engine ran, because a losing rule points at no assignment and
   * could not otherwise be found.
   */
  async explain(
    organizationId: string,
    assignmentId: string,
  ): Promise<AssignmentExplanationDTO> {

    const assignment = await this.assignments.findByIdWithContext(
      organizationId,
      assignmentId,
    )

    if (!assignment) {

      throw new AppError("Assignment not found", 404, ERROR_CODES.NOT_FOUND)
    }

    const own = await this.events.findForAssignment(organizationId, assignmentId)

    const trail = own.length
      ? await this.events.findForEvaluation(
          organizationId,
          assignment.employeeId,
          own[0].evaluatedAt,
        )
      : []

    return {
      assignment: toAssignmentDTO(assignment),
      sourceRuleVersion: toRuleVersionDTO(assignment.sourceRuleVersionRow),
      trail: trail.map(this.toStoredTrailEntry),
    }
  }

  /**
   * Run a hypothetical through the same engine and report the difference.
   *
   * Writes NOTHING — no assignment, no resolution event, no audit row.
   *
   * DECISION: the baseline is the engine's answer for the employee as they
   * stand today, not the assignments currently materialized for them. The
   * question this endpoint answers is "what would this change do?", and
   * comparing against materialized state would fold in any drift that the
   * change is not responsible for.
   */
  async preview(
    organizationId: string,
    employeeId: string,
    data: PreviewEmployeeInput,
  ): Promise<PreviewDTO> {

    const employee = await this.requireEmployee(organizationId, employeeId)
    const asOf = fromIsoDate(data.asOf ?? todayIsoDate())

    // One load, two resolutions: the rules and the real group membership are the
    // same on both sides of the comparison, and loading them twice would let
    // them differ.
    const candidates = await this.rules.findCandidatesForEmployee(organizationId, employeeId)
    const groupIds = await this.groups.findGroupIdsForEmployee(employeeId, asOf)
    const engineRules = candidates.map((row) => this.toEngineRule(row))

    const baseline = resolve({
      employee: this.toEngineEmployee(employee, groupIds),
      rules: engineRules,
      asOf,
    })

    const hypothetical = resolve({
      employee: this.toEngineEmployee(employee, groupIds, data.changes),
      rules: engineRules,
      asOf,
    })

    const before = new Map(baseline.winners.map((winner) => [this.policyKey(winner), winner]))
    const after = new Map(
      hypothetical.winners.map((winner) => [this.policyKey(winner), winner]),
    )

    const added: ResolvedPolicyDTO[] = []
    const removed: ResolvedPolicyDTO[] = []
    const unchanged: ResolvedPolicyDTO[] = []

    for (const [key, winner] of after) {

      if (before.has(key)) {

        unchanged.push(toResolvedPolicyDTO(winner))

        continue
      }

      added.push(toResolvedPolicyDTO(winner))
    }

    for (const [key, winner] of before) {

      if (!after.has(key)) {

        removed.push(toResolvedPolicyDTO(winner))
      }
    }

    return {
      employeeId,
      asOf: toIsoDate(asOf),
      added,
      removed,
      unchanged,
      resolution: this.toResolutionDTO(hypothetical),
    }
  }

  /**
   * Materialize one employee's assignments as of a day.
   *
   * Everything below happens in ONE transaction: the closes, the creates, the
   * decision log and the audit row. A trail that committed without the
   * assignments it describes would be a trail of something that never happened.
   */
  async reconcile(
    organizationId: string,
    actorId: string,
    employeeId: string,
    data: ReconcileEmployeeInput,
  ): Promise<ReconciliationResultDTO> {

    const employee = await this.requireEmployee(organizationId, employeeId)

    // A terminated employee holds no policies: employment ended, and every
    // assignment was end-dated on the day it did. Re-resolving them would
    // resurrect assignments the termination deliberately closed.
    if (employee.status === "TERMINATED") {

      throw new AppError(
        "This employee is terminated and is excluded from resolution",
        409,
        ERROR_CODES.CONFLICT,
      )
    }

    const asOf = fromIsoDate(data.asOf ?? todayIsoDate())
    const evaluatedAt = new Date()

    const result = await this.transactions.run(async (tx) => {

      const resolution = await this.evaluate(organizationId, employee, asOf, tx)

      const current = await this.assignments.findForEmployeeAsOf(
        organizationId,
        employeeId,
        asOf,
        tx,
      )

      const desired = new Map(
        resolution.winners.map((winner) => [this.assignmentKey(winner), winner]),
      )

      const held = new Map(
        current.map((assignment) => [this.currentKey(assignment), assignment]),
      )

      const removed = current.filter(
        (assignment) => !desired.has(this.currentKey(assignment)),
      )

      const toAdd = resolution.winners.filter(
        (winner) => !held.has(this.assignmentKey(winner)),
      )

      const unchanged = current.filter((assignment) =>
        desired.has(this.currentKey(assignment)),
      )

      // Closes run BEFORE creates. The partial unique index that enforces SINGLE
      // cardinality covers open-ended rows only, so superseding one has to end
      // the incumbent before the replacement exists.
      for (const assignment of removed) {

        await this.assignments.close(organizationId, assignment.id, asOf, tx)

        await this.audit.record(
          organizationId,
          {
            actorId,
            action: AUDIT_ACTIONS.ASSIGNMENT_ENDED,
            entityType: AUDIT_ENTITY_TYPES.ASSIGNMENT,
            entityId: assignment.id,
            beforeState: {
              policyId: assignment.policyId,
              categoryId: assignment.categoryId,
              sourceRuleId: assignment.sourceRuleId,
              sourceRuleVersion: assignment.sourceRuleVersion,
              effectiveTo: null,
            },
            afterState: {
              effectiveTo: toIsoDate(asOf),
            },
            metadata: {
              employeeId,
              reason: "no longer produced by any winning rule",
            },
          },
          tx,
        )
      }

      const created: Assignment[] = []

      for (const winner of toAdd) {

        const row = await this.assignments.create(
          organizationId,
          {
            employeeId,
            policyId: winner.policyId,
            categoryId: winner.categoryId,
            cardinality: winner.cardinality,
            sourceRuleId: winner.ruleId,
            sourceRuleVersion: winner.ruleVersion,
            effectiveFrom: asOf,
            effectiveTo: null,
            resolutionStatus: winner.resolutionStatus,
            resolutionReason: winner.reason,
          },
          tx,
        )

        created.push(row)

        await this.audit.record(
          organizationId,
          {
            actorId,
            action: AUDIT_ACTIONS.ASSIGNMENT_CREATED,
            entityType: AUDIT_ENTITY_TYPES.ASSIGNMENT,
            entityId: row.id,
            afterState: {
              policyId: winner.policyId,
              categoryId: winner.categoryId,
              sourceRuleId: winner.ruleId,
              sourceRuleVersion: winner.ruleVersion,
              effectiveFrom: toIsoDate(asOf),
              resolutionReason: winner.reason,
            },
            metadata: {
              employeeId,
            },
          },
          tx,
        )
      }

      // The decision log: one row per rule considered, winners and losers alike.
      // A winner's row points at the assignment it produced; a loser's points at
      // nothing, which is exactly what "it lost" means.
      const assignmentIds = new Map<string, string>()

      for (const row of [...created, ...unchanged]) {

        assignmentIds.set(
          `${row.policyId}|${row.sourceRuleId}|${row.sourceRuleVersion}`,
          row.id,
        )
      }

      const decisions: CreateResolutionEventRecord[] = resolution.trail.map((entry) => ({
        employeeId,
        assignmentId:
          assignmentIds.get(`${entry.policyId}|${entry.ruleId}|${entry.ruleVersion}`) ?? null,
        ruleId: entry.ruleId,
        ruleVersion: entry.ruleVersion,
        policyId: entry.policyId,
        categoryId: entry.categoryId,
        decision: entry.decision,
        reason: entry.reason,
        evaluatedAt,
      }))

      await this.events.createMany(organizationId, decisions, tx)

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: AUDIT_ACTIONS.RECONCILIATION_RAN,
          entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
          entityId: employeeId,
          metadata: {
            asOf: toIsoDate(asOf),
            evaluatedAt: evaluatedAt.toISOString(),
            added: created.length,
            removed: removed.length,
            unchanged: unchanged.length,
            rulesConsidered: resolution.trail.length,
          },
        },
        tx,
      )

      // Re-read the created rows with their policy and category so the response
      // can name them rather than hand back a wall of uuids.
      const after = await this.assignments.findForEmployeeAsOf(
        organizationId,
        employeeId,
        asOf,
        tx,
      )

      const createdIds = new Set(created.map((row) => row.id))

      return {
        added: after.filter((row) => createdIds.has(row.id)),
        removed,
        unchanged,
      }
    })

    return {
      employeeId,
      asOf: toIsoDate(asOf),
      added: result.added.map(toAssignmentDTO),
      removed: result.removed.map(toAssignmentDTO),
      unchanged: result.unchanged.map(toAssignmentDTO),
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Load the candidate rules and the employee context, then run the engine. */
  private async evaluate(
    organizationId: string,
    employee: Employee,
    asOf: Date,
    tx?: Tx,
  ): Promise<ResolutionResult> {

    const candidates = await this.rules.findCandidatesForEmployee(
      organizationId,
      employee.id,
      tx,
    )

    const groupIds = await this.groups.findGroupIdsForEmployee(employee.id, asOf, tx)

    return resolve({
      employee: this.toEngineEmployee(employee, groupIds),
      rules: candidates.map((row) => this.toEngineRule(row)),
      asOf,
    })
  }

  /**
   * Employee row -> engine input, with optional hypothetical substitutions.
   *
   * `undefined` means "leave it alone" and `null` means "clear it" — a preview
   * that asks what happens when a department is removed is a real question, so
   * the two cannot be conflated.
   */
  private toEngineEmployee(
    employee: Employee,
    groupIds: string[],
    changes?: EmployeeOverrides,
  ): EngineEmployee {

    return {
      id: employee.id,
      department: changes?.department !== undefined ? changes.department : employee.department,
      state: changes?.state !== undefined ? changes.state : employee.state,
      country: changes?.country !== undefined ? changes.country : employee.country,
      location: changes?.location !== undefined ? changes.location : employee.location,
      employmentType: changes?.employmentType ?? employee.employmentType,
      role: changes?.role !== undefined ? changes.role : employee.role,
      isManager: changes?.isManager ?? employee.isManager,
      hireDate: changes?.hireDate ? fromIsoDate(changes.hireDate) : employee.hireDate,
      groupIds: changes?.groupIds ?? groupIds,
    }
  }

  /** Rule row + policy + category -> engine input. */
  private toEngineRule(row: PolicyRuleWithPolicy): EngineRule {

    return {
      id: row.id,
      version: row.version,
      name: row.name,
      ruleType: row.ruleType,
      priority: row.priority,
      conditions: row.conditions as unknown as RuleConditions,
      enabled: row.enabled,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      createdAt: row.createdAt,
      employeeId: row.employeeId,
      policyId: row.policyId,
      policyName: row.policy.name,
      policyStatus: row.policy.status,
      categoryId: row.policy.categoryId,
      categoryKey: row.policy.category.key,
      categoryName: row.policy.category.name,
      cardinality: row.policy.category.cardinality,
    }
  }

  /** A stored decision row -> the trail shape the API returns. */
  private toStoredTrailEntry = (event: ResolutionEventWithRule): ResolutionTrailEntryDTO => {

    return {
      ruleId: event.ruleId,
      ruleVersion: event.ruleVersion,
      ruleName: event.ruleVersionRow.name,
      ruleType: event.ruleVersionRow.ruleType,
      priority: event.ruleVersionRow.priority,
      policyId: event.policyId,
      categoryId: event.categoryId,
      decision: event.decision,
      reason: event.reason,
      // The clauses are not stored on the event: the rule version snapshot holds
      // the conditions as they were, and re-deriving which of them matched would
      // be a second evaluation pretending to be a record.
      matchedClauses: [],
      failedClause: null,
    }
  }

  private toResolutionDTO(result: ResolutionResult): ResolutionDTO {

    const categories: CategoryResolutionDTO[] = result.categories.map((category) => ({
      categoryId: category.categoryId,
      categoryKey: category.categoryKey,
      categoryName: category.categoryName,
      cardinality: category.cardinality,
      winners: category.winners.map(toResolvedPolicyDTO),
      trail: category.trail.map(toTrailEntryDTO),
    }))

    return {
      employeeId: result.employeeId,
      asOf: toIsoDate(result.asOf),
      categories,
    }
  }

  /** Identity of a desired assignment: policy, source rule, source rule version. */
  private assignmentKey(winner: ResolvedPolicy): string {

    return `${winner.policyId}|${winner.ruleId}|${winner.ruleVersion}`
  }

  private currentKey(assignment: AssignmentWithContext): string {

    return `${assignment.policyId}|${assignment.sourceRuleId}|${assignment.sourceRuleVersion}`
  }

  /** Identity of a policy for the preview diff — the rule behind it may change. */
  private policyKey(winner: ResolvedPolicy): string {

    return `${winner.categoryId}|${winner.policyId}`
  }

  private page<T>(items: T[], query: { limit: number; offset: number }): Page<T> {

    return {
      items: items.slice(query.offset, query.offset + query.limit),
      total: items.length,
      limit: query.limit,
      offset: query.offset,
    }
  }

  private async requireEmployee(organizationId: string, id: string): Promise<Employee> {

    const employee = await this.employees.findById(organizationId, id)

    if (!employee) {

      throw new AppError("Employee not found", 404, ERROR_CODES.NOT_FOUND)
    }

    return employee
  }
}
