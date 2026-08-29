import { z } from "zod"
import { isoDate, paginationQuery, uuid } from "./common"

/**
 * The audit feed is read-only over HTTP — rows are written transactionally by the
 * services that make the change, never by a client.
 *
 * `entityId` may not be given without `entityType`: an id alone would not use
 * the `(org, entity_type, entity_id, created_at)` index, and the same uuid can
 * name rows of two different kinds. `entityType` alone is fine — it is the
 * index's leading column after the organization.
 */
export const listAuditEventsQuerySchema = paginationQuery
  .extend({
    entityType: z.string().trim().min(1).max(64).optional(),
    entityId: uuid.optional(),
    actorId: uuid.optional(),
    /** Inclusive lower bound on the event day. */
    from: isoDate.optional(),
    /** Exclusive upper bound on the event day. */
    to: isoDate.optional(),
  })
  .strict()
  .refine(
    (query) => !query.entityId || Boolean(query.entityType),
    "entityId must be accompanied by entityType",
  )
  .refine(
    (query) => !query.from || !query.to || query.to > query.from,
    "to must be after from",
  )

export type ListAuditEventsQuery = z.infer<typeof listAuditEventsQuerySchema>
