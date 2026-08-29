import { NextFunction, Response } from "express"
import { AuthedRequest } from "../interfaces/auth"
import { IAuditController } from "../interfaces/rule"
import { AuditService } from "../services/audit"
import {
  employeeAuditQuerySchema,
  idParam,
  listAuditEventsQuerySchema,
} from "../validators"
import { toHttpError } from "../utils/AppError"
import { requireAuthContext } from "../middlewares/auth"

/**
 * The audit feed. Read-only: there is no write endpoint, because every audit row
 * is written by the service that made the change, inside the same transaction.
 */
export class AuditController implements IAuditController {

  constructor(private service: AuditService) {}

  list = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const query = listAuditEventsQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.list(auth.organizationId, query),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  listForEmployee = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const query = employeeAuditQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.listForEmployee(auth.organizationId, id, query),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }
}
