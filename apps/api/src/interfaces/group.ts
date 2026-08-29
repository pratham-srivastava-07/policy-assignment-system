import { NextFunction, Response } from "express"
import { GroupDTO, GroupMemberDTO, Page } from "@policy/shared"
import {
  AddGroupMemberInput,
  CreateGroupInput,
  ListGroupMembersQuery,
  ListGroupsQuery,
  PatchGroupInput,
  ReplaceGroupInput,
} from "../validators"
import { AuthedRequest } from "./auth"

export interface GroupServiceInterface {
  create(
    organizationId: string,
    actorId: string,
    data: CreateGroupInput,
  ): Promise<GroupDTO>

  list(organizationId: string, query: ListGroupsQuery): Promise<Page<GroupDTO>>

  getById(organizationId: string, id: string): Promise<GroupDTO>

  replace(
    organizationId: string,
    actorId: string,
    id: string,
    data: ReplaceGroupInput,
  ): Promise<GroupDTO>

  patch(
    organizationId: string,
    actorId: string,
    id: string,
    data: PatchGroupInput,
  ): Promise<GroupDTO>

  delete(organizationId: string, actorId: string, id: string): Promise<GroupDTO>

  listMembers(
    organizationId: string,
    id: string,
    query: ListGroupMembersQuery,
  ): Promise<Page<GroupMemberDTO>>

  addMember(
    organizationId: string,
    actorId: string,
    id: string,
    data: AddGroupMemberInput,
  ): Promise<GroupMemberDTO>

  removeMember(
    organizationId: string,
    actorId: string,
    id: string,
    employeeId: string,
    effectiveTo?: string,
  ): Promise<GroupMemberDTO>
}

export interface IGroupController {
  create(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  list(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  getById(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  replace(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  patch(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  delete(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  listMembers(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  addMember(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  removeMember(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}
