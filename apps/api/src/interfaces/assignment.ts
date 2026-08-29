import { NextFunction, Response } from "express"
import {
  AssignmentDTO,
  AssignmentExplanationDTO,
  Page,
  PreviewDTO,
  ReconciliationResultDTO,
  RuleDTO,
} from "@policy/shared"
import { AccessQuery, GrantAccessInput } from "../validators"
import { AuthedRequest } from "./auth"

/**
 * `ResolutionServiceInterface` moved to `@policy/core` with the service that
 * implements it: the reconciliation worker calls the same materialization, and
 * a worker cannot import a module that names `Response`. It is re-exported here
 * so the API still reads it from the interface module it always did.
 */
export type { ResolutionServiceInterface } from "@policy/core"

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
