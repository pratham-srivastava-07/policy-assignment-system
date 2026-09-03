import type {
  AssignmentExplanationDTO,
  AuditEventDTO,
  GroupDTO,
  Page,
  PolicyAssignmentDTO,
  PolicyCategoryDTO,
  PolicyDTO,
  PublicUser,
  ReconciliationEventDTO,
  ReconciliationStatusDTO,
} from "@policy/shared"
import { api } from "@/lib/api"
import { asOfQueryValue, type AsOf } from "@/lib/dates"

/**
 * Reference data and the read-only surfaces.
 *
 * Policies, categories and groups are few, change rarely and back every picker
 * in the application, so they are fetched once under the REFERENCE tier and
 * resolved from cache wherever a DTO carries an id but not a name (§17.3).
 */

export const listPolicies = (
  params: { search?: string; categoryId?: string; status?: string } = {},
  signal?: AbortSignal,
) =>
  api.get<Page<PolicyDTO>>("/policies", {
    signal,
    tier: "READ",
    query: { limit: 100, ...params },
  })

export const getPolicy = (id: string, signal?: AbortSignal) =>
  api.get<PolicyDTO>(`/policies/${id}`, { signal, tier: "READ" })

export const listPolicyAssignments = (id: string, asOf: AsOf, signal?: AbortSignal) =>
  api.get<Page<PolicyAssignmentDTO>>(`/policies/${id}/assignments`, {
    signal,
    tier: "READ",
    query: { asOf: asOfQueryValue(asOf), limit: 50 },
  })

export const listCategories = (signal?: AbortSignal) =>
  api.get<Page<PolicyCategoryDTO>>("/policy-categories", {
    signal,
    tier: "READ",
    query: { limit: 100 },
  })

export const listGroups = (params: { search?: string } = {}, signal?: AbortSignal) =>
  api.get<Page<GroupDTO>>("/groups", {
    signal,
    tier: "READ",
    query: { limit: 100, ...params },
  })

export const getExplanation = (assignmentId: string, signal?: AbortSignal) =>
  api.get<AssignmentExplanationDTO>(`/assignments/${assignmentId}/explanation`, {
    signal,
    tier: "READ",
  })

export interface AuditFilters {
  search?: string
  entityType?: string
  actorId?: string
  from?: string
  to?: string
}

export const listAuditEvents = (
  filters: AuditFilters,
  page: { limit: number; offset: number },
  signal?: AbortSignal,
) =>
  api.get<Page<AuditEventDTO>>("/audit-events", {
    signal,
    tier: "READ",
    query: { ...filters, ...page },
  })

/** §32.3: `AuditEventDTO` carries `actorId` only, so names need one batch lookup. */
export const listUsers = (signal?: AbortSignal) =>
  api.get<Page<PublicUser>>("/user", { signal, tier: "READ", query: { limit: 100 } })

export const getReconciliationStatus = (signal?: AbortSignal) =>
  api.get<ReconciliationStatusDTO>("/reconciliation/status", { signal, tier: "READ" })

export const listReconciliationEvents = (
  params: { status?: string; aggregateType?: string } = {},
  signal?: AbortSignal,
) =>
  api.get<Page<ReconciliationEventDTO>>("/reconciliation/events", {
    signal,
    tier: "READ",
    query: { limit: 50, ...params },
  })
