import { Cardinality, ResolutionStatus } from "./enums"
import { IsoDate, IsoDateTime } from "./dto"

/**
 * The reconciliation stream.
 *
 * The worker publishes one of these after every reconciliation it performs. The
 * API relays them to browsers over an authenticated, organization-scoped SSE
 * endpoint; the worker itself is never exposed to a browser, because it has no
 * session, no RBAC and no tenant scoping, and `docs/architecture.md` §4 calls
 * that boundary critical.
 *
 * Nothing here is derived. Every field comes from the `ReconciliationResultDTO`
 * the worker already computed, or from the employee row it already read.
 */

export const RECONCILIATION_STREAM_CHANNEL_PREFIX = "policy:reconciliation"

/** One organization's channel. Subscribers never see another tenant's traffic. */
export const reconciliationChannel = (organizationId: string): string =>
  `${RECONCILIATION_STREAM_CHANNEL_PREFIX}:${organizationId}`

/** How long a client may go without any frame before it should call itself stale. */
export const RECONCILIATION_STREAM_HEARTBEAT_MS = 20_000

export const RECONCILIATION_STREAM_STALE_AFTER_MS = 45_000

/** Events replayed to a client that reconnects with `Last-Event-ID`. */
export const RECONCILIATION_STREAM_REPLAY_LIMIT = 100

export const RECONCILIATION_STREAM_EVENTS = [
  "reconciliation.applied",
  "heartbeat",
  "connected",
] as const

export type ReconciliationStreamEventName =
  (typeof RECONCILIATION_STREAM_EVENTS)[number]

/** One policy that entered or left an employee's state. */
export interface StreamAssignmentDTO {
  assignmentId: string
  policyId: string
  policyName: string
  categoryId: string
  categoryName: string
  cardinality: Cardinality
  sourceRuleId: string
  sourceRuleName: string
  sourceRuleVersion: number
  resolutionStatus: ResolutionStatus
  effectiveFrom: IsoDate
  effectiveTo: IsoDate | null
}

/**
 * One reconciliation, as it happened.
 *
 * No-ops are published too, and carry `added: []` / `removed: []`. A rule edit
 * that sweeps 120 employees and changes 12 of them is a true and useful thing to
 * see; suppressing the 108 would make the fan-out invisible and the feed a lie
 * about how much work ran.
 */
export interface ReconciliationStreamEvent {
  /** Monotonic within one API process. Sent as the SSE `id:` field. */
  id: string
  organizationId: string
  employeeId: string
  employeeName: string
  occurredAt: IsoDateTime
  asOf: IsoDate
  /** The outbox `event_type` that caused this run, e.g. `employee.attributes_changed`. */
  trigger: string
  outboxEventId: string | null
  added: StreamAssignmentDTO[]
  removed: StreamAssignmentDTO[]
  unchangedCount: number
}

/** Sent on open, and every `RECONCILIATION_STREAM_HEARTBEAT_MS` thereafter. */
export interface ReconciliationStreamHeartbeat {
  serverTime: IsoDateTime
}
