import { Employee } from "@policy/db"
import { NextFunction, Response } from "express"
import { EmployeeAttributeHistoryDTO, EmployeeDTO, Page } from "@policy/shared"
import {
  CreateEmployeeInput,
  ListEmployeesQuery,
  PatchEmployeeInput,
  ReplaceEmployeeInput,
} from "../validators"
import { AuthedRequest } from "./auth"

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
  /** Case-insensitive substring match over name and email. */
  search?: string
}

export interface EmployeeListOptions extends EmployeeFilters {
  limit: number
  offset: number
}

export interface EmployeeServiceInterface {
  create(
    organizationId: string,
    actorId: string,
    data: CreateEmployeeInput,
  ): Promise<EmployeeDTO>

  list(organizationId: string, query: ListEmployeesQuery): Promise<Page<EmployeeDTO>>

  getById(organizationId: string, id: string): Promise<EmployeeDTO>

  replace(
    organizationId: string,
    actorId: string,
    id: string,
    data: ReplaceEmployeeInput,
  ): Promise<EmployeeDTO>

  patch(
    organizationId: string,
    actorId: string,
    id: string,
    data: PatchEmployeeInput,
  ): Promise<EmployeeDTO>

  delete(organizationId: string, actorId: string, id: string): Promise<EmployeeDTO>

  getAttributeHistory(
    organizationId: string,
    id: string,
  ): Promise<EmployeeAttributeHistoryDTO[]>
}

export interface IEmployeeController {
  create(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  getById(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  replace(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  patch(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  delete(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  getAttributeHistory(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}

/** Row -> transport shape. Tenure is derived here, never read from a column. */
export type EmployeeRow = Employee
