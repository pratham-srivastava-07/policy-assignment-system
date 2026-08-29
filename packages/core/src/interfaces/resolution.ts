import {
  AssignmentDTO,
  AssignmentExplanationDTO,
  Page,
  PreviewDTO,
  ReconciliationResultDTO,
} from "@policy/shared"

/**
 * The resolution vocabulary, stated without Zod and without Express.
 *
 * DECISION: these input shapes are declared structurally here rather than
 * imported from `apps/api/src/validators`. The API still parses with the same
 * Zod schemas it always did and hands the parsed values straight in — the
 * inferred types are structurally identical, so nothing at the call sites
 * changed. What changed is the direction of the dependency: `@policy/core` is
 * consumed by the worker as well as the API, and a worker has no request to
 * validate, so it must not have to depend on the HTTP layer's parsers to name
 * the arguments of a service it calls.
 *
 * The schemas remain the single source of truth for validation; these are the
 * single source of truth for the service's signature. If a schema gains a field
 * the service reads, it gets added here too.
 */

/** `?limit=&offset=` on every list endpoint. */
export interface PaginationInput {
  limit: number
  offset: number
}

/**
 * Policy state is time-dependent, so every read is a point-in-time question.
 * `asOf` is a `YYYY-MM-DD` calendar day and defaults to today in the service.
 */
export interface EmployeeAssignmentsQuery extends PaginationInput {
  asOf?: string
}

export interface ListAssignmentsQuery extends PaginationInput {
  asOf?: string
  employeeIds: string[]
}

/**
 * A hypothetical employee. Every key is optional and only the ones present are
 * applied on top of the real record.
 *
 * `undefined` means "leave it alone" and `null` means "clear it" — a preview
 * that asks what happens when a department is removed is a real question, so the
 * two cannot be conflated.
 */
export interface PreviewEmployeeChanges {
  department?: string | null
  role?: string | null
  location?: string | null
  state?: string | null
  country?: string | null
  employmentType?: string
  isManager?: boolean
  hireDate?: string
  /** When present, replaces the whole membership set. */
  groupIds?: string[]
}

export interface PreviewEmployeeInput {
  asOf?: string
  changes: PreviewEmployeeChanges
}

export interface ReconcileEmployeeInput {
  asOf?: string
}

export interface ResolutionServiceInterface {
  /** "Which policies applied to this employee on date D?" */
  listForEmployee(
    organizationId: string,
    employeeId: string,
    query: EmployeeAssignmentsQuery,
  ): Promise<Page<AssignmentDTO>>

  /** The batch read — one query for many employees, not one query each. */
  listForEmployees(
    organizationId: string,
    query: ListAssignmentsQuery,
  ): Promise<Page<AssignmentDTO>>

  /** "Why does this assignment exist?" — winner, rule text, and every loser. */
  explain(organizationId: string, assignmentId: string): Promise<AssignmentExplanationDTO>

  /** Hypothetical changes through the same engine. Writes NOTHING. */
  preview(
    organizationId: string,
    employeeId: string,
    data: PreviewEmployeeInput,
  ): Promise<PreviewDTO>

  /**
   * Materialize: desired versus current, end-date and create the difference.
   *
   * `actorId` is null for a system-initiated run — the reconciliation worker
   * has no user behind it, and `audit_events.actor_id` is nullable for exactly
   * that case.
   */
  reconcile(
    organizationId: string,
    actorId: string | null,
    employeeId: string,
    data: ReconcileEmployeeInput,
  ): Promise<ReconciliationResultDTO>
}
