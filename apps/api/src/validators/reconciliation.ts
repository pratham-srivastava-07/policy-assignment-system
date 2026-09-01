import { z } from "zod"
import { OUTBOX_STATUSES } from "@policy/shared"
import { paginationQuery, uuid } from "./common"

export const listReconciliationEventsQuerySchema = paginationQuery
  .extend({
    status: z.enum(OUTBOX_STATUSES).optional(),
    aggregateType: z.string().trim().min(1).max(64).optional(),
    aggregateId: uuid.optional(),
  })
  .strict()

export type ListReconciliationEventsQuery = z.infer<typeof listReconciliationEventsQuerySchema>
