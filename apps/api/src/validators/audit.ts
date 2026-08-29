import { z } from "zod"
import { paginationQuery } from "./common"

/**
 * The audit feed is read-only over HTTP — rows are written transactionally by the
 * services that make the change, never by a client.
 *
 * `entityType` and `entityId` are paired: filtering by one without the other
 * would not use the `(org, entity_type, entity_id, created_at)` index and is
 * almost never what the caller means.
 */
export const listAuditEventsQuerySchema = paginationQuery
  .extend({
    entityType: z.string().trim().min(1).max(64).optional(),
    entityId: z.uuid().optional(),
  })
  .strict()
  .refine(
    (query) => Boolean(query.entityType) === Boolean(query.entityId),
    "entityType and entityId must be provided together",
  )

export type ListAuditEventsQuery = z.infer<typeof listAuditEventsQuerySchema>
