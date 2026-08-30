import { Employee, EmployeeStatus } from "@policy/db"

/**
 * The persistence-shaped half of the employee vocabulary.
 *
 * These types describe what a repository writes and what it may filter on, so
 * they live beside the repositories rather than beside the HTTP layer. The
 * service and controller interfaces that name `Request`/`Response` stay in
 * `apps/api/src/interfaces/employee.ts`, which re-exports everything here.
 */

/** The columns a repository write actually persists. */
export interface EmployeeRecord {
  name: string
  email: string
  hireDate: Date
  employmentType: string
  department: string | null
  role: string | null
  location: string | null
  state: string | null
  country: string | null
  /**
   * Who this employee reports to — the org chart edge, and the source of truth
   * behind `isManager`.
   */
  managerId: string | null
  isManager: boolean
}

export type CreateEmployeeRecord = EmployeeRecord

export type UpdateEmployeeRecord = Partial<EmployeeRecord>

/** Attribute filters a list request may narrow on. */
export interface EmployeeFilters {
  department?: string
  state?: string
  country?: string
  location?: string
  employmentType?: string
  role?: string
  isManager?: boolean
  status?: EmployeeStatus
  /** Case-insensitive substring match over name and email. */
  search?: string
  /**
   * Confines the result to these ids.
   *
   * Not a user-supplied filter — it is how a role-based read scope reaches the
   * query. A MANAGER's collection read is narrowed to their org-chart subtree by
   * setting this, so the narrowing happens in the WHERE clause rather than by
   * trimming rows after the fact.
   */
  employeeIds?: string[]
}

export interface EmployeeListOptions extends EmployeeFilters {
  limit: number
  offset: number
}

/** Row -> transport shape. Tenure is derived on read, never read from a column. */
export type EmployeeRow = Employee

/**
 * The org-chart narrowing applied to a collection read.
 *
 * A permission answers "may you read employees?"; it cannot answer "which
 * ones?". For a single-record read the answer is a yes/no the middleware can
 * give. For a collection it is a filter, and a filter has to reach the query —
 * so the controller resolves the caller's scope from their role and hands it
 * down, and the service turns it into a WHERE clause. A list is never trimmed
 * after the fact: `total` would then count rows the caller may not see.
 *
 * `null`/absent means unscoped, which is what an admin gets.
 */
export interface SubtreeReadScope {
  /** The caller's own employee record. Their subtree includes it. */
  rootEmployeeId: string
}
