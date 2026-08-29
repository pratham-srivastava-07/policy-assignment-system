import { Employee, PolicyRule, PrismaClass } from "@policy/db"
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  EMPTY_RULE_CONDITIONS,
  ERROR_CODES,
  MatchingEmployeeDTO,
  OUTBOX_AGGREGATE_TYPES,
  OUTBOX_EVENT_TYPES,
  Page,
  RULE_TYPE_PRIORITY_BANDS,
  RuleConditions,
  RuleDTO,
  RuleVersionDTO,
  fromIsoDate,
  toIsoDate,
  todayIsoDate,
} from "@policy/shared"
import {
  AuditEventRepository,
  EmployeeGroupRepository,
  EmployeeRepository,
  OutboxEventRepository,
  PolicyRepository,
  PolicyRuleRepository,
  PolicyRuleVersionRepository,
} from "../repositories"
import { TxClient } from "../interfaces/db"
import { RuleServiceInterface } from "../interfaces/rule"
import {
  CreateOverrideInput,
  CreateRuleInput,
  ListRulesQuery,
  MatchingEmployeesQuery,
  PatchRuleInput,
  SimulateRuleInput,
} from "../validators"
import { AppError } from "../utils/AppError"
import { toRuleDTO, toRuleVersionDTO } from "../utils/serialize"
import { buildEmployeeContext, evaluateConditions, explainMatch } from "../engine"

/** The rule state that a version snapshot records. */
interface RuleState {
  policyId: string
  employeeId: string | null
  name: string
  priority: number
  conditions: RuleConditions
  enabled: boolean
  effectiveFrom: Date
  effectiveTo: Date | null
}

/**
 * Assignment rules, including manual overrides.
 *
 * Three things hold everywhere in this file.
 *
 * FORWARD-ONLY EDITS. Any change to a field the engine reads — policy,
 * conditions, priority, effective dates, enabled, target employee — mints a new
 * `policy_rule_versions` snapshot and bumps the rule's version. Assignments
 * point at (rule id, version), so yesterday's assignment still explains itself
 * against the rule text that produced it. A name change mints nothing: it cannot
 * change an outcome.
 *
 * NO HARD DELETES. `DELETE /rules/:id` disables the rule and end-dates it today.
 * A rule with versions can never be removed — an assignment that pointed at a
 * deleted rule would be an assignment nobody could explain.
 *
 * PRIORITY IS THE AUTHORITY. `ruleType` is descriptive: it drives reconciliation
 * fan-out and supplies a default priority band at creation, and it never
 * overrules a number an admin typed.
 */
export class RuleService implements RuleServiceInterface {

  private prisma = PrismaClass.getInstance()

  constructor(
    private rules: PolicyRuleRepository,
    private versions: PolicyRuleVersionRepository,
    private policies: PolicyRepository,
    private employees: EmployeeRepository,
    private groups: EmployeeGroupRepository,
    private audit: AuditEventRepository,
    private outbox: OutboxEventRepository,
  ) {}

  async create(
    organizationId: string,
    actorId: string,
    data: CreateRuleInput,
  ): Promise<RuleDTO> {

    return this.createRule(organizationId, actorId, data, AUDIT_ACTIONS.RULE_CREATED)
  }

  private async createRule(
    organizationId: string,
    actorId: string,
    data: CreateRuleInput,
    action: string,
  ): Promise<RuleDTO> {

    await this.requirePolicy(organizationId, data.policyId)

    if (data.employeeId) {

      await this.requireEmployee(organizationId, data.employeeId)
    }

    const state: RuleState = {
      policyId: data.policyId,
      employeeId: data.employeeId ?? null,
      name: data.name,
      // No explicit priority means the default band for this rule type. The band
      // is a starting number, not a second ordering dimension.
      priority: data.priority ?? RULE_TYPE_PRIORITY_BANDS[data.ruleType],
      conditions: data.conditions,
      enabled: data.enabled ?? true,
      effectiveFrom: fromIsoDate(data.effectiveFrom),
      effectiveTo: data.effectiveTo ? fromIsoDate(data.effectiveTo) : null,
    }

    const rule = await this.prisma.$transaction(async (tx) => {

      const created = await this.rules.create(
        organizationId,
        {
          ...state,
          ruleType: data.ruleType,
        },
        tx,
      )

      // Version 1 is written at creation, not at the first edit: an assignment
      // made a minute later has to have a snapshot to point at.
      await this.snapshot(created, actorId, tx)

      await this.audit.record(
        organizationId,
        {
          actorId,
          action,
          entityType: AUDIT_ENTITY_TYPES.POLICY_RULE,
          entityId: created.id,
          afterState: this.auditSnapshot(created),
        },
        tx,
      )

      await this.enqueue(organizationId, OUTBOX_EVENT_TYPES.RULE_CREATED, created, tx)

      return created
    })

    return toRuleDTO(rule)
  }

  async list(organizationId: string, query: ListRulesQuery): Promise<Page<RuleDTO>> {

    const [rows, total] = await Promise.all([
      this.rules.findMany(organizationId, query),
      this.rules.count(organizationId, query),
    ])

    return {
      items: rows.map(toRuleDTO),
      total,
      limit: query.limit,
      offset: query.offset,
    }
  }

  async getById(organizationId: string, id: string): Promise<RuleDTO> {

    return toRuleDTO(await this.requireRule(organizationId, id))
  }

  async patch(
    organizationId: string,
    actorId: string,
    id: string,
    data: PatchRuleInput,
  ): Promise<RuleDTO> {

    const before = await this.requireRule(organizationId, id)

    if (data.policyId && data.policyId !== before.policyId) {

      await this.requirePolicy(organizationId, data.policyId)
    }

    const next: RuleState = {
      policyId: data.policyId ?? before.policyId,
      employeeId: before.employeeId,
      name: data.name ?? before.name,
      priority: data.priority ?? before.priority,
      conditions: data.conditions ?? (before.conditions as unknown as RuleConditions),
      enabled: data.enabled ?? before.enabled,
      effectiveFrom: data.effectiveFrom
        ? fromIsoDate(data.effectiveFrom)
        : before.effectiveFrom,
      effectiveTo:
        data.effectiveTo === undefined
          ? before.effectiveTo
          : data.effectiveTo === null
            ? null
            : fromIsoDate(data.effectiveTo),
    }

    this.assertSaneWindow(next)

    return this.applyEdit(organizationId, actorId, before, next, {
      action: AUDIT_ACTIONS.RULE_UPDATED,
      outboxEvent: OUTBOX_EVENT_TYPES.RULE_UPDATED,
    })
  }

  async setPriority(
    organizationId: string,
    actorId: string,
    id: string,
    priority: number,
  ): Promise<RuleDTO> {

    const before = await this.requireRule(organizationId, id)

    return this.applyEdit(
      organizationId,
      actorId,
      before,
      { ...this.stateOf(before), priority },
      {
        action: AUDIT_ACTIONS.RULE_PRIORITY_CHANGED,
        outboxEvent: OUTBOX_EVENT_TYPES.RULE_UPDATED,
      },
    )
  }

  async setEnabled(
    organizationId: string,
    actorId: string,
    id: string,
    enabled: boolean,
  ): Promise<RuleDTO> {

    const before = await this.requireRule(organizationId, id)

    return this.applyEdit(
      organizationId,
      actorId,
      before,
      { ...this.stateOf(before), enabled },
      {
        action: enabled ? AUDIT_ACTIONS.RULE_ENABLED : AUDIT_ACTIONS.RULE_DISABLED,
        outboxEvent: enabled
          ? OUTBOX_EVENT_TYPES.RULE_ENABLED
          : OUTBOX_EVENT_TYPES.RULE_DISABLED,
      },
    )
  }

  /**
   * Soft delete: disabled, and end-dated today.
   *
   * `effectiveTo` is exclusive, so a rule deleted today stops applying today and
   * every assignment it produced before today keeps its explanation.
   */
  async softDelete(
    organizationId: string,
    actorId: string,
    id: string,
  ): Promise<RuleDTO> {

    const before = await this.requireRule(organizationId, id)

    return this.retire(organizationId, actorId, before, AUDIT_ACTIONS.RULE_DELETED)
  }

  async listVersions(organizationId: string, id: string): Promise<RuleVersionDTO[]> {

    // Resolving the rule in the organization first is what scopes this read —
    // `policy_rule_versions` carries no organization column of its own.
    await this.requireRule(organizationId, id)

    const rows = await this.versions.findHistory(id)

    return rows.map(toRuleVersionDTO)
  }

  async listOverrides(organizationId: string, employeeId: string): Promise<RuleDTO[]> {

    await this.requireEmployee(organizationId, employeeId)

    const rows = await this.rules.findOverridesForEmployee(organizationId, employeeId)

    return rows.map(toRuleDTO)
  }

  /**
   * A manual override is a rule, not a special case: `ruleType = MANUAL`,
   * `employeeId` set, no conditions. That is what keeps
   * `assignments.source_rule_id` NOT NULL and every assignment explainable
   * through exactly one mechanism.
   */
  async createOverride(
    organizationId: string,
    actorId: string,
    employeeId: string,
    data: CreateOverrideInput,
  ): Promise<RuleDTO> {

    const employee = await this.requireEmployee(organizationId, employeeId)
    const policy = await this.requirePolicy(organizationId, data.policyId)

    return this.createRule(
      organizationId,
      actorId,
      {
        policyId: data.policyId,
        employeeId,
        name: data.name ?? `Manual override: ${policy.name} for ${employee.name}`,
        ruleType: "MANUAL",
        priority: data.priority ?? RULE_TYPE_PRIORITY_BANDS.MANUAL,
        conditions: EMPTY_RULE_CONDITIONS,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? null,
      },
      AUDIT_ACTIONS.OVERRIDE_CREATED,
    )
  }

  /** Same soft delete as a rule, refusing anything that is not an override. */
  async deleteOverride(
    organizationId: string,
    actorId: string,
    id: string,
  ): Promise<RuleDTO> {

    const before = await this.requireRule(organizationId, id)

    if (before.ruleType !== "MANUAL") {

      throw new AppError(
        "This rule is not a manual override; delete it through /rules",
        409,
        ERROR_CODES.CONFLICT,
      )
    }

    return this.retire(organizationId, actorId, before, AUDIT_ACTIONS.OVERRIDE_DELETED)
  }

  /**
   * "Which employees does this rule match?"
   *
   * Conditions only. This answers who the rule CATCHES, not who it WINS for —
   * whether it beats another rule in the same category depends on that
   * category's other rules and is what `POST /reconciliation/employees/:id` and
   * `GET /employees/:id/assignments` report. Keeping the two apart is
   * deliberate: an admin writing a rule wants to see its population before they
   * think about precedence.
   *
   * Writes nothing.
   */
  async matchingEmployees(
    organizationId: string,
    id: string,
    query: MatchingEmployeesQuery,
  ): Promise<Page<MatchingEmployeeDTO>> {

    const rule = await this.requireRule(organizationId, id)
    const asOf = fromIsoDate(query.asOf ?? todayIsoDate())

    return this.sweep(
      organizationId,
      rule.conditions as unknown as RuleConditions,
      rule.employeeId,
      asOf,
      query,
    )
  }

  /** The same sweep, over a rule body that has not been saved. Writes nothing. */
  async simulate(
    organizationId: string,
    data: SimulateRuleInput,
  ): Promise<Page<MatchingEmployeeDTO>> {

    const asOf = fromIsoDate(data.asOf ?? todayIsoDate())

    return this.sweep(
      organizationId,
      data.conditions,
      data.employeeId ?? null,
      asOf,
      data,
    )
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Evaluate one set of conditions against every ACTIVE employee.
   *
   * Only matching employees come back. The page is taken after evaluation
   * because whether an employee matches is not a database predicate — tenure is
   * derived and group membership is effective-dated — so there is nothing to
   * page on until the engine has run.
   */
  private async sweep(
    organizationId: string,
    conditions: RuleConditions,
    targetEmployeeId: string | null,
    asOf: Date,
    page: { limit: number; offset: number },
  ): Promise<Page<MatchingEmployeeDTO>> {

    const population = await this.employees.findAllActive(organizationId)

    // A manual override has a population of exactly one, by definition.
    const candidates = targetEmployeeId
      ? population.filter((employee) => employee.id === targetEmployeeId)
      : population

    const groupIds = await this.groups.findGroupIdsForEmployees(
      candidates.map((employee) => employee.id),
      asOf,
    )

    const matches: MatchingEmployeeDTO[] = []

    for (const employee of candidates) {

      const context = buildEmployeeContext(
        {
          id: employee.id,
          department: employee.department,
          state: employee.state,
          country: employee.country,
          location: employee.location,
          employmentType: employee.employmentType,
          role: employee.role,
          isManager: employee.isManager,
          hireDate: employee.hireDate,
          groupIds: groupIds.get(employee.id) ?? [],
        },
        asOf,
      )

      const evaluation = evaluateConditions(conditions, context)

      if (!evaluation.matched) {

        continue
      }

      matches.push({
        employeeId: employee.id,
        name: employee.name,
        email: employee.email,
        matched: true,
        reason: explainMatch(evaluation.matchedClauses),
        matchedClauses: evaluation.matchedClauses,
        failedClause: null,
      })
    }

    return {
      items: matches.slice(page.offset, page.offset + page.limit),
      total: matches.length,
      limit: page.limit,
      offset: page.offset,
    }
  }

  /**
   * The one write path for every edit.
   *
   * An evaluable change mints a version and enqueues reconciliation. A change
   * that only touches the name does neither — it cannot alter an outcome, so
   * minting a version for it would fill the history with noise and make the
   * versions that matter harder to find.
   */
  private async applyEdit(
    organizationId: string,
    actorId: string,
    before: PolicyRule,
    next: RuleState,
    meta: { action: string; outboxEvent: string },
  ): Promise<RuleDTO> {

    const evaluableChange = this.hasEvaluableChange(before, next)
    const version = evaluableChange ? before.version + 1 : before.version

    const after = await this.prisma.$transaction(async (tx) => {

      const updated = await this.rules.update(
        organizationId,
        before.id,
        {
          ...next,
          version,
        },
        tx,
      )

      if (updated === 0) {

        throw new AppError("Rule not found", 404, ERROR_CODES.NOT_FOUND)
      }

      const row = await this.rules.findById(organizationId, before.id, tx)

      if (!row) {

        throw new AppError("Rule not found", 404, ERROR_CODES.NOT_FOUND)
      }

      if (evaluableChange) {

        await this.snapshot(row, actorId, tx)
      }

      await this.audit.record(
        organizationId,
        {
          actorId,
          action: meta.action,
          entityType: AUDIT_ENTITY_TYPES.POLICY_RULE,
          entityId: before.id,
          beforeState: this.auditSnapshot(before),
          afterState: this.auditSnapshot(row),
          metadata: {
            mintedVersion: evaluableChange ? version : null,
          },
        },
        tx,
      )

      if (evaluableChange) {

        await this.enqueue(organizationId, meta.outboxEvent, row, tx)
      }

      return row
    })

    return toRuleDTO(after)
  }

  /** Disable and end-date. Shared by rule deletion and override deletion. */
  private async retire(
    organizationId: string,
    actorId: string,
    before: PolicyRule,
    action: string,
  ): Promise<RuleDTO> {

    const today = fromIsoDate(todayIsoDate())

    const next: RuleState = {
      ...this.stateOf(before),
      enabled: false,
      // A rule that never started cannot be end-dated before it began; in that
      // case the window collapses onto its own start, which is empty under the
      // half-open predicate and therefore matches nothing.
      effectiveTo: before.effectiveFrom > today ? before.effectiveFrom : today,
    }

    return this.applyEdit(organizationId, actorId, before, next, {
      action,
      outboxEvent: OUTBOX_EVENT_TYPES.RULE_DELETED,
    })
  }

  /** Which fields the engine actually reads. A name is not one of them. */
  private hasEvaluableChange(before: PolicyRule, next: RuleState): boolean {

    const beforeConditions = JSON.stringify(before.conditions)
    const nextConditions = JSON.stringify(next.conditions)

    return (
      before.policyId !== next.policyId ||
      before.employeeId !== next.employeeId ||
      before.priority !== next.priority ||
      before.enabled !== next.enabled ||
      before.effectiveFrom.getTime() !== next.effectiveFrom.getTime() ||
      (before.effectiveTo?.getTime() ?? null) !== (next.effectiveTo?.getTime() ?? null) ||
      beforeConditions !== nextConditions
    )
  }

  private stateOf(rule: PolicyRule): RuleState {

    return {
      policyId: rule.policyId,
      employeeId: rule.employeeId,
      name: rule.name,
      priority: rule.priority,
      conditions: rule.conditions as unknown as RuleConditions,
      enabled: rule.enabled,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
    }
  }

  private assertSaneWindow(state: RuleState): void {

    if (state.effectiveTo && state.effectiveTo <= state.effectiveFrom) {

      throw new AppError(
        "effectiveTo must be after effectiveFrom",
        400,
        ERROR_CODES.INVALID_EFFECTIVE_RANGE,
      )
    }
  }

  /** Write the immutable snapshot for the rule's current version. */
  private async snapshot(rule: PolicyRule, actorId: string, tx: TxClient): Promise<void> {

    await this.versions.create(
      {
        ruleId: rule.id,
        version: rule.version,
        policyId: rule.policyId,
        employeeId: rule.employeeId,
        name: rule.name,
        ruleType: rule.ruleType,
        priority: rule.priority,
        conditions: rule.conditions as unknown as RuleConditions,
        enabled: rule.enabled,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        createdBy: actorId,
      },
      tx,
    )
  }

  private async enqueue(
    organizationId: string,
    eventType: string,
    rule: PolicyRule,
    tx: TxClient,
  ): Promise<void> {

    await this.outbox.enqueue(
      organizationId,
      {
        eventType,
        aggregateType: OUTBOX_AGGREGATE_TYPES.POLICY_RULE,
        aggregateId: rule.id,
        payload: {
          ruleId: rule.id,
          ruleVersion: rule.version,
          // The worker narrows its fan-out with these: a DEPARTMENT rule only
          // affects employees whose department could match it.
          ruleType: rule.ruleType,
          policyId: rule.policyId,
          employeeId: rule.employeeId,
          effectiveFrom: toIsoDate(rule.effectiveFrom),
        },
      },
      tx,
    )
  }

  private async requireRule(organizationId: string, id: string): Promise<PolicyRule> {

    const rule = await this.rules.findById(organizationId, id)

    if (!rule) {

      throw new AppError("Rule not found", 404, ERROR_CODES.NOT_FOUND)
    }

    return rule
  }

  private async requirePolicy(organizationId: string, policyId: string) {

    const policy = await this.policies.findById(organizationId, policyId)

    if (!policy) {

      throw new AppError("Policy not found", 404, ERROR_CODES.NOT_FOUND)
    }

    return policy
  }

  private async requireEmployee(
    organizationId: string,
    employeeId: string,
  ): Promise<Employee> {

    const employee = await this.employees.findById(organizationId, employeeId)

    if (!employee) {

      throw new AppError("Employee not found", 404, ERROR_CODES.NOT_FOUND)
    }

    return employee
  }

  private auditSnapshot(rule: PolicyRule) {

    return {
      policyId: rule.policyId,
      employeeId: rule.employeeId,
      name: rule.name,
      ruleType: rule.ruleType,
      priority: rule.priority,
      conditions: rule.conditions,
      enabled: rule.enabled,
      effectiveFrom: toIsoDate(rule.effectiveFrom),
      effectiveTo: rule.effectiveTo ? toIsoDate(rule.effectiveTo) : null,
      version: rule.version,
    }
  }
}
