import { NextFunction, Response } from "express"
import { EmployeeAttributeHistoryDTO, EmployeeDTO, Page } from "@policy/shared"
import {
  CreateEmployeeInput,
  ListEmployeesQuery,
  PatchEmployeeInput,
  ReplaceEmployeeInput,
} from "../validators"
import { AuthedRequest } from "./auth"

/**
 * The record and filter types moved to `@policy/core` when the repositories
 * did — the worker writes employees through the same repository and cannot see
 * this file, which names `Request` and `Response`. They are re-exported here so
 * that everything in `apps/api` still reads them from the interface module it
 * always did.
 */
export type {
  CreateEmployeeRecord,
  EmployeeFilters,
  EmployeeListOptions,
  EmployeeRecord,
  EmployeeRow,
  UpdateEmployeeRecord,
} from "@policy/core"

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

  /**
   * Termination. Replaces hard deletion: the row survives so that the
   * assignments, audit events and resolution events naming this employee stay
   * explainable.
   */
  terminate(
    organizationId: string,
    actorId: string,
    id: string,
    terminatedOn?: string,
  ): Promise<EmployeeDTO>

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
  terminate(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  getAttributeHistory(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}
