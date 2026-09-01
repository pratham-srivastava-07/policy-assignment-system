import { Page, ReconciliationEventDTO, ReconciliationStatusDTO } from "@policy/shared"
import { OutboxEventRepository, toReconciliationEventDTO } from "@policy/core"
import { ReconciliationServiceInterface } from "../interfaces/reconciliation"
import { ListReconciliationEventsQuery } from "../validators"

/**
 * Read-only view of the outbox for one organization.
 *
 * The rows are written by the services that change state and drained by the
 * worker; nothing here mutates them. A FAILED row is the one signal an operator
 * needs from this table: reconciliation that is owed and will not happen on its
 * own.
 */
export class ReconciliationService implements ReconciliationServiceInterface {

  constructor(private outbox: OutboxEventRepository) {}

  async status(organizationId: string): Promise<ReconciliationStatusDTO> {

    const [counts, oldestPending] = await Promise.all([
      this.outbox.countByStatus(organizationId),
      this.outbox.oldestPendingAt(organizationId),
    ])

    return {
      counts,
      oldestPendingAt: oldestPending ? oldestPending.toISOString() : null,
    }
  }

  async listEvents(
    organizationId: string,
    query: ListReconciliationEventsQuery,
  ): Promise<Page<ReconciliationEventDTO>> {

    const [rows, total] = await Promise.all([
      this.outbox.findForOrganization(organizationId, query, query),
      this.outbox.countForOrganization(organizationId, query),
    ])

    return {
      items: rows.map(toReconciliationEventDTO),
      total,
      limit: query.limit,
      offset: query.offset,
    }
  }
}
