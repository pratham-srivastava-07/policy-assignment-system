import { NextFunction, Response } from "express"
import { Page, PublicUser } from "@policy/shared"
import { CreateUserInput, ListUsersQuery, UpdateUserInput } from "../validators"
import { AuthedRequest } from "./auth"

/** What a repository write actually persists — never the plaintext password. */
export interface CreateUserRecord {
  name: string
  email: string
  passwordHash: string
  employeeId?: string | null
}

export interface UpdateUserRecord {
  name?: string
  email?: string
  passwordHash?: string
  employeeId?: string | null
}

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
