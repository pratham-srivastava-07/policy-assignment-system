import { NextFunction, Response } from "express"
import {
  AuditEventDTO,
  MatchingEmployeeDTO,
  Page,
  RuleDTO,
  RuleVersionDTO,
} from "@policy/shared"
import {
  CreateOverrideInput,
  CreateRuleInput,
  EmployeeAuditQuery,
  ListAuditEventsQuery,
  ListRulesQuery,
  MatchingEmployeesQuery,
  PatchRuleInput,
  SimulateRuleInput,
} from "../validators"
import { AuthedRequest } from "./auth"

export interface RuleServiceInterface {
  create(
    organizationId: string,
    actorId: string,
    data: CreateRuleInput,
  ): Promise<RuleDTO>

  list(organizationId: string, query: ListRulesQuery): Promise<Page<RuleDTO>>

  getById(organizationId: string, id: string): Promise<RuleDTO>

  /** Forward-only: an evaluable change mints a new version. */
  patch(
    organizationId: string,
    actorId: string,
    id: string,
    data: PatchRuleInput,
  ): Promise<RuleDTO>

  setPriority(
    organizationId: string,
    actorId: string,
    id: string,
    priority: number,
  ): Promise<RuleDTO>

  setEnabled(
    organizationId: string,
    actorId: string,
    id: string,
    enabled: boolean,
  ): Promise<RuleDTO>

  /** Soft delete: disabled and end-dated today. A rule with versions never goes. */
  softDelete(organizationId: string, actorId: string, id: string): Promise<RuleDTO>

  listVersions(organizationId: string, id: string): Promise<RuleVersionDTO[]>

  listOverrides(organizationId: string, employeeId: string): Promise<RuleDTO[]>

  createOverride(
    organizationId: string,
    actorId: string,
    employeeId: string,
    data: CreateOverrideInput,
  ): Promise<RuleDTO>

  deleteOverride(organizationId: string, actorId: string, id: string): Promise<RuleDTO>

  /** Who does this saved rule match, on a given day? Writes nothing. */
  matchingEmployees(
    organizationId: string,
    id: string,
    query: MatchingEmployeesQuery,
  ): Promise<Page<MatchingEmployeeDTO>>

  /** Who would this UNSAVED rule body match? Writes nothing. */
  simulate(
    organizationId: string,
    data: SimulateRuleInput,
  ): Promise<Page<MatchingEmployeeDTO>>
}

export interface AuditServiceInterface {
  list(
    organizationId: string,
    query: ListAuditEventsQuery,
  ): Promise<Page<AuditEventDTO>>

  listForEmployee(
    organizationId: string,
    employeeId: string,
    query: EmployeeAuditQuery,
  ): Promise<Page<AuditEventDTO>>
}

export interface IRuleController {
  create(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  getById(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  patch(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  patchPriority(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  enable(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  disable(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  delete(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  listVersions(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  matchingEmployees(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  simulate(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  listOverrides(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  createOverride(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  deleteOverride(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}

export interface IAuditController {
  list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  listForEmployee(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}
