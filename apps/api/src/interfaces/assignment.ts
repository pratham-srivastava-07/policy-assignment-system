import { NextFunction, Response } from "express"
import {
  AssignmentDTO,
  AssignmentExplanationDTO,
  Page,
  PreviewDTO,
  ReconciliationResultDTO,
  RuleDTO,
} from "@policy/shared"
import {
  AccessQuery,
  EmployeeAssignmentsQuery,
  GrantAccessInput,
  ListAssignmentsQuery,
  PreviewEmployeeInput,
  ReconcileEmployeeInput,
} from "../validators"
import { AuthedRequest } from "./auth"

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

  /** Materialize: desired versus current, end-date and create the difference. */
  reconcile(
    organizationId: string,
    actorId: string,
    employeeId: string,
    data: ReconcileEmployeeInput,
  ): Promise<ReconciliationResultDTO>
}

export interface AccessServiceInterface {
  /** Application access, read out of the assignments in that category. */
  list(organizationId: string, query: AccessQuery): Promise<Page<AssignmentDTO>>

  /** Grant or re-grant, by creating or updating a MANUAL override rule. */
  grant(
    organizationId: string,
    actorId: string,
    data: GrantAccessInput,
  ): Promise<RuleDTO>
}

export interface IAssignmentController {
  listForEmployee(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  explain(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  preview(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  reconcile(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}

export interface IAccessController {
  list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  put(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  patch(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}
