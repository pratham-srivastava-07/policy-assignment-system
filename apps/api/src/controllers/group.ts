import { NextFunction, Response } from "express"
import { AuthedRequest } from "../interfaces/auth"
import { IGroupController } from "../interfaces/group"
import { GroupService } from "../services/group"
import {
  addGroupMemberSchema,
  createGroupSchema,
  groupMemberParamsSchema,
  idParam,
  listGroupMembersQuerySchema,
  listGroupsQuerySchema,
  patchGroupSchema,
  removeGroupMemberQuerySchema,
  replaceGroupSchema,
} from "../validators"
import { toHttpError } from "../utils/AppError"
import { requireAuthContext } from "../middlewares/auth"

export class GroupController implements IGroupController {

  constructor(private service: GroupService) {}

  create = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const data = createGroupSchema.parse(req.body)

      res.status(201).json({
        success: true,
        data: await this.service.create(auth.organizationId, auth.userId, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  list = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const query = listGroupsQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.list(auth.organizationId, query),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  getById = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.getById(auth.organizationId, id),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  replace = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const data = replaceGroupSchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.replace(auth.organizationId, auth.userId, id, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  patch = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const data = patchGroupSchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.patch(auth.organizationId, auth.userId, id, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  delete = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.delete(auth.organizationId, auth.userId, id),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  listMembers = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const query = listGroupMembersQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.listMembers(auth.organizationId, id, query),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  addMember = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const data = addGroupMemberSchema.parse(req.body)

      res.status(201).json({
        success: true,
        data: await this.service.addMember(auth.organizationId, auth.userId, id, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  removeMember = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id, employeeId } = groupMemberParamsSchema.parse(req.params)
      const { effectiveTo } = removeGroupMemberQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.removeMember(
          auth.organizationId,
          auth.userId,
          id,
          employeeId,
          effectiveTo,
        ),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }
}
