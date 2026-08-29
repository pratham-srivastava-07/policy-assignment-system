import { NextFunction, Response } from "express"
import { AuthedRequest } from "../interfaces/auth"
import { IUserController } from "../interfaces/user"
import { UserService } from "../services/user"
import {
  createUserSchema,
  findUserByEmailQuerySchema,
  idParam,
  listUsersQuerySchema,
  updateUserSchema,
} from "../validators"
import { toHttpError } from "../utils/AppError"
import { requireAuthContext } from "../middlewares/auth"

export class UserController implements IUserController {

  constructor(private service: UserService) {}

  // Arrow-fn properties keep `this` bound when handed to Express routes.

  createUser = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const data = createUserSchema.parse(req.body)

      res.status(201).json({
        success: true,
        data: await this.service.createUser(auth.organizationId, auth.userId, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  listUsers = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const query = listUsersQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.listUsers(auth.organizationId, query),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  getUserById = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.getUserById(auth.organizationId, id),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  findByEmail = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { email } = findUserByEmailQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.findByEmail(auth.organizationId, email),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  updateUser = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const data = updateUserSchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.updateUser(auth.organizationId, auth.userId, id, data),
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
}
