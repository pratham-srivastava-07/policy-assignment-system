import { NextFunction, Response } from "express"
import { AuthedRequest } from "../interfaces/auth"
import { IReconciliationController } from "../interfaces/reconciliation"
import { ReconciliationService } from "../services/reconciliation"
import { listReconciliationEventsQuerySchema } from "../validators"
import { toHttpError } from "@policy/core"
import { requireAuthContext } from "../middlewares/auth"

export class ReconciliationController implements IReconciliationController {

  constructor(private service: ReconciliationService) {}

  status = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)

      res.status(200).json({
        success: true,
        data: await this.service.status(auth.organizationId),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  listEvents = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const query = listReconciliationEventsQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.listEvents(auth.organizationId, query),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }
}
