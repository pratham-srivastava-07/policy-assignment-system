import { NextFunction, Response } from "express"
import { Page, PolicyCategoryDTO, PolicyDTO } from "@policy/shared"
import {
  CreatePolicyCategoryInput,
  CreatePolicyInput,
  ListPoliciesQuery,
  ListPolicyCategoriesQuery,
  PatchPolicyCategoryInput,
  PatchPolicyInput,
  ReplacePolicyInput,
} from "../validators"
import { AuthedRequest } from "./auth"

export interface PolicyCategoryServiceInterface {
  create(
    organizationId: string,
    actorId: string,
    data: CreatePolicyCategoryInput,
  ): Promise<PolicyCategoryDTO>

  list(
    organizationId: string,
    query: ListPolicyCategoriesQuery,
  ): Promise<Page<PolicyCategoryDTO>>

  getById(organizationId: string, id: string): Promise<PolicyCategoryDTO>

  patch(
    organizationId: string,
    actorId: string,
    id: string,
    data: PatchPolicyCategoryInput,
  ): Promise<PolicyCategoryDTO>

  delete(organizationId: string, actorId: string, id: string): Promise<PolicyCategoryDTO>
}

export interface PolicyServiceInterface {
  create(
    organizationId: string,
    actorId: string,
    data: CreatePolicyInput,
  ): Promise<PolicyDTO>

  list(organizationId: string, query: ListPoliciesQuery): Promise<Page<PolicyDTO>>

  getById(organizationId: string, id: string): Promise<PolicyDTO>

  replace(
    organizationId: string,
    actorId: string,
    id: string,
    data: ReplacePolicyInput,
  ): Promise<PolicyDTO>

  patch(
    organizationId: string,
    actorId: string,
    id: string,
    data: PatchPolicyInput,
  ): Promise<PolicyDTO>

  delete(organizationId: string, actorId: string, id: string): Promise<PolicyDTO>
}

export interface IPolicyCategoryController {
  create(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  getById(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  patch(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  delete(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}

export interface IPolicyController {
  create(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  getById(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  replace(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  patch(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  delete(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}
