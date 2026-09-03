import type {
  AssignmentDTO,
  EmployeeAttributeHistoryDTO,
  EmployeeDTO,
  EmployeeGroupMembershipDTO,
  Page,
  PreviewDTO,
  ReconciliationResultDTO,
} from "@policy/shared"
import { api } from "@/lib/api"
import { asOfQueryValue, type AsOf } from "@/lib/dates"

export interface EmployeeFilters {
  search?: string
  department?: string
  state?: string
  country?: string
  location?: string
  employmentType?: string
  role?: string
  status?: string
  isManager?: boolean
}

/** §11.2: every one of these is an exact match except `search`. */
export const listEmployees = (
  filters: EmployeeFilters,
  page: { limit: number; offset: number },
  signal?: AbortSignal,
) =>
  api.get<Page<EmployeeDTO>>("/employees", {
    signal,
    tier: "READ",
    query: { ...filters, ...page },
  })

export const getEmployee = (id: string, signal?: AbortSignal) =>
  api.get<EmployeeDTO>(`/employees/${id}`, { signal, tier: "READ" })

export const listEmployeeAssignments = (id: string, asOf: AsOf, signal?: AbortSignal) =>
  api.get<Page<AssignmentDTO>>(`/employees/${id}/assignments`, {
    signal,
    tier: "READ",
    query: { asOf: asOfQueryValue(asOf), limit: 100 },
  })

export const listEmployeeGroups = (id: string, asOf: AsOf, signal?: AbortSignal) =>
  api.get<EmployeeGroupMembershipDTO[]>(`/employees/${id}/groups`, {
    signal,
    tier: "READ",
    query: { asOf: asOfQueryValue(asOf) },
  })

export const listAttributeHistory = (id: string, signal?: AbortSignal) =>
  api.get<Page<EmployeeAttributeHistoryDTO>>(`/employees/${id}/attribute-history`, {
    signal,
    tier: "READ",
    query: { limit: 100 },
  })

export interface EmployeeChanges {
  department?: string
  state?: string
  country?: string
  location?: string
  employmentType?: string
  role?: string
}

/**
 * EXPENSIVE. Never fired automatically, never on a keystroke — the budget is 5
 * burst per organization and shared by every admin in the tenant (§20.1).
 */
export const previewEmployee = (
  id: string,
  changes: EmployeeChanges,
  asOf: AsOf,
  signal?: AbortSignal,
) =>
  api.post<PreviewDTO>(
    `/employees/${id}/preview`,
    { changes, ...(asOf ? { asOf } : {}) },
    { signal, tier: "EXPENSIVE" },
  )

export const patchEmployee = (
  id: string,
  body: EmployeeChanges & { effectiveFrom?: string; managerId?: string },
) => api.patch<EmployeeDTO>(`/employees/${id}`, body, { tier: "WRITE" })

/** Synchronous: the response is the result, not a queued acknowledgement (§31.1). */
export const reconcileEmployee = (id: string, asOf: AsOf) =>
  api.post<ReconciliationResultDTO>(
    `/reconciliation/employees/${id}`,
    asOf ? { asOf } : {},
    { tier: "EXPENSIVE" },
  )
