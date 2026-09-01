import { NextFunction, Response } from "express"
import { AuthedRequest } from "../interfaces/auth"
import { IEmployeeController } from "../interfaces/employee"
import { EmployeeService } from "../services/employee"
import {
  asOfQuery,
  createEmployeeSchema,
  idParam,
  listEmployeesQuerySchema,
  patchEmployeeSchema,
  replaceEmployeeSchema,
  terminateEmployeeSchema,
} from "../validators"
import { toHttpError } from "@policy/core"
import { requireAuthContext } from "../middlewares/auth"
import { collectionReadScope } from "../middlewares/permission"

/**
 * Every handler takes its organization from `requireAuthContext(req)` — never
 * from a route or query parameter. That is the tenant boundary.
 */
export class EmployeeController implements IEmployeeController {

  constructor(private service: EmployeeService) {}

  create = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const data = createEmployeeSchema.parse(req.body)

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
      const query = listEmployeesQuerySchema.parse(req.query)

      // "Which employees may you read?" is a filter, not a yes/no, so middleware
      // cannot express it. The role decides the scope here; the service puts it
      // in the WHERE clause.
      const scope = collectionReadScope(auth)

      res.status(200).json({
        success: true,
        data: await this.service.list(auth.organizationId, query, scope),
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
      const data = replaceEmployeeSchema.parse(req.body)

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
      const data = patchEmployeeSchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.patch(auth.organizationId, auth.userId, id, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  /** DELETE is a termination, not a deletion. See the service. */
  terminate = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const { terminatedOn } = terminateEmployeeSchema.parse(req.body ?? {})

      res.status(200).json({
        success: true,
        data: await this.service.terminate(
          auth.organizationId,
          auth.userId,
          id,
          terminatedOn,
        ),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  getAttributeHistory = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.getAttributeHistory(auth.organizationId, id),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  getGroups = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const { asOf } = asOfQuery.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.getGroups(auth.organizationId, id, asOf),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }
}
