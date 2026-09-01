import { NextFunction, Response } from "express"
import { Page, ReconciliationEventDTO, ReconciliationStatusDTO } from "@policy/shared"
import { ListReconciliationEventsQuery } from "../validators"
import { AuthedRequest } from "./auth"

export interface ReconciliationServiceInterface {
  status(organizationId: string): Promise<ReconciliationStatusDTO>

  listEvents(
    organizationId: string,
    query: ListReconciliationEventsQuery,
  ): Promise<Page<ReconciliationEventDTO>>
}

export interface IReconciliationController {
  status(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  listEvents(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}
