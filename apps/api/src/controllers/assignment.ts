import { NextFunction, Response } from "express"
import { AuthedRequest } from "../interfaces/auth"
import { IAccessController, IAssignmentController } from "../interfaces/assignment"
import { AccessService } from "../services/access"
import { ResolutionService } from "@policy/core"
import {
  accessQuerySchema,
  employeeAssignmentsQuerySchema,
  grantAccessSchema,
  idParam,
  listAssignmentsQuerySchema,
  previewEmployeeSchema,
  reconcileEmployeeSchema,
} from "../validators"
import { toHttpError } from "@policy/core"
import { requireAuthContext } from "../middlewares/auth"
import { assertEmployeeReadScope, collectionReadScope } from "../middlewares/permission"

/**
 * Reads over materialized policy state, plus the two engine runs that write
 * nothing (`preview`) and the one that writes everything (`reconcile`).
 *
 * Every read takes an optional `asOf` and defaults it to today in the service.
 */
export class AssignmentController implements IAssignmentController {

  constructor(private service: ResolutionService) {}

  listForEmployee = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const query = employeeAssignmentsQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.listForEmployee(auth.organizationId, id, query),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  list = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const query = listAssignmentsQuerySchema.parse(req.query)

      // The batch read names arbitrary employees, so the caller's scope has to
      // be intersected with what they asked for. Middleware cannot do that —
      // it is a filter over a list, not a decision about one id.
      const scope = collectionReadScope(auth)

      res.status(200).json({
        success: true,
        data: await this.service.listForEmployees(auth.organizationId, query, scope),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  explain = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      const explanation = await this.service.explain(auth.organizationId, id)

      await assertEmployeeReadScope(auth, explanation.assignment.employeeId)

      res.status(200).json({
        success: true,
        data: explanation,
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  /** Hypothetical changes through the engine. Writes nothing. */
  preview = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const data = previewEmployeeSchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.preview(auth.organizationId, id, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  reconcile = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const data = reconcileEmployeeSchema.parse(req.body ?? {})

      res.status(200).json({
        success: true,
        data: await this.service.reconcile(auth.organizationId, auth.userId, id, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }
}

/**
 * Application access.
 *
 * No POST: access is derived from assignments and cannot be written directly.
 * PUT and PATCH create the manual override rule that produces it.
 */
export class AccessController implements IAccessController {

  constructor(private service: AccessService) {}

  list = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const query = accessQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.list(auth.organizationId, query),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  put = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const data = grantAccessSchema.parse(req.body)

      res.status(201).json({
        success: true,
        data: await this.service.grant(auth.organizationId, auth.userId, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  patch = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const data = grantAccessSchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.grant(auth.organizationId, auth.userId, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }
}
