import { NextFunction, Response } from "express"
import { AuditEventDTO, Page, RuleDTO, RuleVersionDTO } from "@policy/shared"
import {
  CreateOverrideInput,
  CreateRuleInput,
  ListAuditEventsQuery,
  ListRulesQuery,
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

  setEnabled(
    organizationId: string,
    actorId: string,
    id: string,
    enabled: boolean,
  ): Promise<RuleDTO>

  listVersions(organizationId: string, id: string): Promise<RuleVersionDTO[]>

  listOverrides(organizationId: string, employeeId: string): Promise<RuleDTO[]>

  createOverride(
    organizationId: string,
    actorId: string,
    employeeId: string,
    data: CreateOverrideInput,
  ): Promise<RuleDTO>
}

export interface AuditServiceInterface {
  list(
    organizationId: string,
    query: ListAuditEventsQuery,
  ): Promise<Page<AuditEventDTO>>
}

export interface IRuleController {
  create(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  getById(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  enable(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  disable(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  listVersions(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  listOverrides(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  createOverride(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}

export interface IAuditController {
  list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}
