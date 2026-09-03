import type {
  Cardinality,
  Page,
  PolicyCategoryDTO,
  PolicyDTO,
  PolicyStatus,
} from "@policy/shared"
import { api } from "@/lib/api"

/**
 * Policy and category writes.
 *
 * Reads live in `features/reference`, because every picker in the application
 * needs them and they are cached once under the REFERENCE tier. Only the
 * mutations are here.
 */

export interface PolicyWriteBody {
  categoryId: string
  name: string
  description?: string | null
  status?: PolicyStatus
}

export const createPolicy = (body: PolicyWriteBody) =>
  api.post<PolicyDTO>("/policies", body, { tier: "WRITE" })

/** `categoryId` is absent on purpose: the server refuses to patch it. */
export const patchPolicy = (
  id: string,
  body: Partial<Omit<PolicyWriteBody, "categoryId">>,
) => api.patch<PolicyDTO>(`/policies/${id}`, body, { tier: "WRITE" })

/** Archives rather than erases; rules pointing at it keep resolving to nothing. */
export const archivePolicy = (id: string) =>
  api.delete<PolicyDTO>(`/policies/${id}`, { tier: "WRITE" })

export interface CategoryWriteBody {
  name: string
  key: string
  cardinality: Cardinality
}

export const createCategory = (body: CategoryWriteBody) =>
  api.post<PolicyCategoryDTO>("/policy-categories", body, { tier: "WRITE" })

/**
 * `cardinality` is not patchable. Moving a category from MULTIPLE to SINGLE
 * would invalidate assignments that already exist, which is a migration rather
 * than an edit, so the form disables the control instead of hiding it.
 */
export const patchCategory = (id: string, body: { name?: string; key?: string }) =>
  api.patch<PolicyCategoryDTO>(`/policy-categories/${id}`, body, { tier: "WRITE" })

export const deleteCategory = (id: string) =>
  api.delete<PolicyCategoryDTO>(`/policy-categories/${id}`, { tier: "WRITE" })

export const listAllPolicies = (
  params: { search?: string; categoryId?: string; status?: string },
  page: { limit: number; offset: number },
  signal?: AbortSignal,
) =>
  api.get<Page<PolicyDTO>>("/policies", {
    signal,
    tier: "READ",
    query: { ...params, ...page },
  })
