import type {
  MatchingEmployeeDTO,
  Page,
  RuleConditions,
  RuleDTO,
  RuleType,
  RuleVersionDTO,
} from "@policy/shared"
import { api } from "@/lib/api"
import { asOfQueryValue, type AsOf } from "@/lib/dates"

export interface RuleFilters {
  search?: string
  policyId?: string
  ruleType?: string
  enabled?: boolean
}

export const listRules = (
  filters: RuleFilters,
  page: { limit: number; offset: number },
  signal?: AbortSignal,
) =>
  api.get<Page<RuleDTO>>("/rules", {
    signal,
    tier: "READ",
    query: { ...filters, ...page },
  })

export const getRule = (id: string, signal?: AbortSignal) =>
  api.get<RuleDTO>(`/rules/${id}`, { signal, tier: "READ" })

export const listRuleVersions = (id: string, signal?: AbortSignal) =>
  api.get<Page<RuleVersionDTO>>(`/rules/${id}/versions`, {
    signal,
    tier: "READ",
    query: { limit: 50 },
  })

export interface SimulateInput {
  ruleType: RuleType
  conditions: RuleConditions
}

/**
 * EXPENSIVE, and it sweeps every active employee regardless of how narrow the
 * rule is. It answers "who matches these conditions?" and nothing more: it knows
 * neither the policy nor the priority, so a matching employee here is not a
 * promise that they would receive the policy (§20).
 */
export const simulateRule = (input: SimulateInput, asOf: AsOf, signal?: AbortSignal) =>
  api.post<Page<MatchingEmployeeDTO>>(
    "/rules/simulate",
    { ...input, ...(asOf ? { asOf } : {}), limit: 25 },
    { signal, tier: "EXPENSIVE" },
  )

export const listMatchingEmployees = (id: string, asOf: AsOf, signal?: AbortSignal) =>
  api.get<Page<MatchingEmployeeDTO>>(`/rules/${id}/matching-employees`, {
    signal,
    tier: "EXPENSIVE",
    query: { asOf: asOfQueryValue(asOf), limit: 25 },
  })

export interface RuleWriteBody {
  name: string
  policyId: string
  ruleType: RuleType
  priority: number
  conditions: RuleConditions
  effectiveFrom: string
  effectiveTo?: string | null
  enabled?: boolean
}

export const createRule = (body: RuleWriteBody) =>
  api.post<RuleDTO>("/rules", body, { tier: "WRITE" })

/** `ruleType` is absent on purpose: the server refuses to patch it (§18.1). */
export const patchRule = (
  id: string,
  body: Partial<Omit<RuleWriteBody, "ruleType" | "policyId">>,
) => api.patch<RuleDTO>(`/rules/${id}`, body, { tier: "WRITE" })

export const setRulePriority = (id: string, priority: number) =>
  api.patch<RuleDTO>(`/rules/${id}/priority`, { priority }, { tier: "WRITE" })

export const enableRule = (id: string) =>
  api.post<RuleDTO>(`/rules/${id}/enable`, undefined, { tier: "WRITE" })

export const disableRule = (id: string) =>
  api.post<RuleDTO>(`/rules/${id}/disable`, undefined, { tier: "WRITE" })

/** A soft delete: disabled and end-dated today. Labelled "Retire" (§24). */
export const retireRule = (id: string) =>
  api.delete<RuleDTO>(`/rules/${id}`, { tier: "WRITE" })
