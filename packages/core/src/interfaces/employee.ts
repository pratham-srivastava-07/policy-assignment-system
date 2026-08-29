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
}

export interface EmployeeListOptions extends EmployeeFilters {
  limit: number
  offset: number
}

/** Row -> transport shape. Tenure is derived on read, never read from a column. */
export type EmployeeRow = Employee
