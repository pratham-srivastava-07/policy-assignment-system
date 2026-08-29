/**
 * Who does a rule change affect?
 *
 * This is the half of reconciliation that employee-triggered events do not need.
 * An employee event names its employee; a rule event names only the rule, and the
 * affected population has to be derived.
 *
 * The set is a union of three things, and all three are required:
 *
 *   1. Employees matching the rule's NEW conditions — they may now be owed a
 *      policy they did not have.
 *   2. Employees matching the rule's PREVIOUS conditions — they may now be owed
 *      the REMOVAL of one. This is the half that is easy to forget, and forgetting
 *      it leaves an employee holding a policy whose rule no longer selects them.
 *   3. Employees currently holding an assignment sourced from this rule —
 *      the catch-all. It covers disable, retire and priority changes, where the
 *      conditions did not move at all but the outcome did, and it repairs drift
 *      from any earlier reconciliation that did not complete.
 *
 * Only ids are returned. Reconciling each one is `ResolutionService.reconcile`,
 * which recomputes that employee's whole policy state from scratch — so this does
 * not need to know WHY an employee is affected, only that they might be.
 */

import { RuleConditionsV1 } from "@policy/shared"
import { TxClient } from "../interfaces/db"
import { AssignmentRepository } from "../repositories/assignment.repository"
import { EmployeeRepository } from "../repositories/employee.repository"
import { PolicyRuleRepository } from "../repositories/policy-rule.repository"
import { PolicyRuleVersionRepository } from "../repositories/policy-rule-version.repository"
import { EmployeeGroupRepository } from "../repositories/employee-group.repository"
import { CandidateFilter, isUnnarrowed, narrowConditions } from "../engine/candidates"
import { buildEmployeeContext, evaluateConditions } from "../engine"

export interface FanOutResult {
  /** Distinct employee ids owed a reconciliation. */
  employeeIds: string[]
  /**
   * True when the rule had no narrowable conditions and the whole active
   * population was loaded. Worth logging — it is correct, but it is the
   * expensive case.
   */
  sweptWholeOrganization: boolean
  /** How the set was assembled, for the worker's log. */
  breakdown: {
    fromCurrentConditions: number
    fromPreviousConditions: number
    fromExistingAssignments: number
  }
}

export class RuleFanOutService {

  constructor(
    private rules: PolicyRuleRepository,
    private versions: PolicyRuleVersionRepository,
    private employees: EmployeeRepository,
    private groups: EmployeeGroupRepository,
    private assignments: AssignmentRepository,
  ) {}

  /**
   * The employees a change to `ruleId` could affect, as of `asOf`.
   *
   * `ruleVersion` is the version the event was written for; the previous
   * conditions come from `ruleVersion - 1`. A rule at version 1 has no previous
   * snapshot, which is correct — nothing could have matched it before it existed.
   */
  async affectedEmployeeIds(
    organizationId: string,
    ruleId: string,
    ruleVersion: number | null,
    asOf: Date,
    tx?: TxClient,
  ): Promise<FanOutResult> {

    const rule = await this.rules.findById(organizationId, ruleId, tx)

    if (!rule) {

      // The rule is gone. Anyone still holding an assignment sourced from it is
      // the entire affected population, and they need it removed.
      const holders = await this.assignments.findBySourceRule(organizationId, ruleId, tx)

      const ids = this.distinct(holders.map((row) => row.employeeId))

      return {
        employeeIds: ids,
        sweptWholeOrganization: false,
        breakdown: {
          fromCurrentConditions: 0,
          fromPreviousConditions: 0,
          fromExistingAssignments: ids.length,
        },
      }
    }

    // A MANUAL override names its one employee. No population to derive.
    if (rule.employeeId) {

      return {
        employeeIds: [rule.employeeId],
        sweptWholeOrganization: false,
        breakdown: {
          fromCurrentConditions: 1,
          fromPreviousConditions: 0,
          fromExistingAssignments: 0,
        },
      }
    }

    const current = await this.matching(
      organizationId,
      this.conditionsOf(rule.conditions),
      asOf,
      tx,
    )

    const previous = await this.previousMatching(
      organizationId,
      ruleId,
      ruleVersion,
      asOf,
      tx,
    )

    const holders = await this.assignments.findBySourceRule(organizationId, ruleId, tx)

    const holderIds = holders.map((row) => row.employeeId)

    const employeeIds = this.distinct([
      ...current.ids,
      ...previous.ids,
      ...holderIds,
    ])

    return {
      employeeIds,
      sweptWholeOrganization: current.swept || previous.swept,
      breakdown: {
        fromCurrentConditions: current.ids.length,
        fromPreviousConditions: previous.ids.length,
        fromExistingAssignments: holderIds.length,
      },
    }
  }

  /**
   * Employees matching the snapshot one version back.
   *
   * A missing snapshot is not an error: version 1 has no predecessor, and a rule
   * whose history was never written simply contributes nothing here — the
   * assignment-holder arm of the union still catches anyone affected.
   */
  private async previousMatching(
    organizationId: string,
    ruleId: string,
    ruleVersion: number | null,
    asOf: Date,
    tx?: TxClient,
  ): Promise<{ ids: string[]; swept: boolean }> {

    if (ruleVersion === null || ruleVersion <= 1) {

      return { ids: [], swept: false }
    }

    const snapshot = await this.versions.findVersion(ruleId, ruleVersion - 1, tx)

    if (!snapshot) {

      return { ids: [], swept: false }
    }

    return this.matching(organizationId, this.conditionsOf(snapshot.conditions), asOf, tx)
  }

  /**
   * Employees matching one set of conditions.
   *
   * Two steps, and the split is the whole point of not sweeping: the narrowable
   * clauses become a query the indexes can serve, and only what comes back is
   * evaluated in memory for the clauses that could not be pushed down. Pushing an
   * AND down can only shrink the set, so nothing that truly matches is missed.
   */
  private async matching(
    organizationId: string,
    conditions: RuleConditionsV1 | null,
    asOf: Date,
    tx?: TxClient,
  ): Promise<{ ids: string[]; swept: boolean }> {

    if (!conditions) {

      return { ids: [], swept: false }
    }

    const narrowed = narrowConditions(conditions, asOf)

    const candidates = await this.employees.findCandidates(
      organizationId,
      narrowed.filter,
      asOf,
      tx,
    )

    const swept = isUnnarrowed(narrowed.filter)

    // Every clause made it into the query, so everything returned matches.
    if (narrowed.exhaustive) {

      return { ids: candidates.map((employee) => employee.id), swept }
    }

    // One batched membership lookup for the whole candidate set rather than a
    // query per employee — the residual pass is already the slow path.
    const membership = await this.groups.findGroupIdsForEmployees(
      candidates.map((employee) => employee.id),
      asOf,
      tx,
    )

    const ids: string[] = []

    for (const employee of candidates) {

      const context = buildEmployeeContext(
        {
          id: employee.id,
          hireDate: employee.hireDate,
          department: employee.department,
          role: employee.role,
          location: employee.location,
          state: employee.state,
          country: employee.country,
          employmentType: employee.employmentType,
          isManager: employee.isManager,
          groupIds: membership.get(employee.id) ?? [],
        },
        asOf,
      )

      if (evaluateConditions(conditions, context).matched) {

        ids.push(employee.id)
      }
    }

    return { ids, swept }
  }

  /**
   * The JSONB column, typed.
   *
   * Conditions are stored as JSON, so the row type says `JsonValue`. A row whose
   * conditions are absent or malformed matches nobody rather than throwing — a
   * broken rule should not stop the rest of a reconciliation batch.
   */
  private conditionsOf(value: unknown): RuleConditionsV1 | null {

    if (!value || typeof value !== "object") {

      return null
    }

    const candidate = value as Partial<RuleConditionsV1>

    if (!Array.isArray(candidate.all)) {

      return null
    }

    return candidate as RuleConditionsV1
  }

  private distinct(ids: string[]): string[] {

    return Array.from(new Set(ids))
  }
}
