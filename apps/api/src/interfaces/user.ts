import { NextFunction, Response } from "express"
import { Page, PublicUser } from "@policy/shared"
import { CreateUserInput, ListUsersQuery, UpdateUserInput } from "../validators"
import { AuthedRequest } from "./auth"

/**
 * The record types moved to `@policy/core` with the repositories that consume
 * them, and are re-exported here so nothing in `apps/api` had to change where
 * it reads them from.
 */
export type { CreateUserRecord, UpdateUserRecord } from "@policy/core"

export interface UserServiceInterface {
  createUser(
    organizationId: string,
    actorId: string,
    data: CreateUserInput,
  ): Promise<PublicUser>

  listUsers(organizationId: string, query: ListUsersQuery): Promise<Page<PublicUser>>

  getUserById(organizationId: string, id: string): Promise<PublicUser>

  findByEmail(organizationId: string, email: string): Promise<PublicUser>

  updateUser(
    organizationId: string,
    actorId: string,
    id: string,
    data: UpdateUserInput,
  ): Promise<PublicUser>

  delete(organizationId: string, actorId: string, id: string): Promise<PublicUser>
}

export interface IUserController {
  createUser(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  listUsers(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  getUserById(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  findByEmail(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  updateUser(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  delete(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}

export type { PublicUser }
