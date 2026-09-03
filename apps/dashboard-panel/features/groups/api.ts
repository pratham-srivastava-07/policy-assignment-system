import type { GroupDTO, GroupMemberDTO, Page } from "@policy/shared"
import { api } from "@/lib/api"
import { asOfQueryValue, type AsOf } from "@/lib/dates"

export interface GroupWriteBody {
  name: string
  description?: string | null
}

export const listAllGroups = (
  params: { search?: string },
  page: { limit: number; offset: number },
  signal?: AbortSignal,
) =>
  api.get<Page<GroupDTO>>("/groups", {
    signal,
    tier: "READ",
    query: { ...params, ...page },
  })

export const getGroup = (id: string, signal?: AbortSignal) =>
  api.get<GroupDTO>(`/groups/${id}`, { signal, tier: "READ" })

export const listGroupMembers = (id: string, asOf: AsOf, signal?: AbortSignal) =>
  api.get<Page<GroupMemberDTO>>(`/groups/${id}/members`, {
    signal,
    tier: "READ",
    query: { asOf: asOfQueryValue(asOf), limit: 100 },
  })

export const createGroup = (body: GroupWriteBody) =>
  api.post<GroupDTO>("/groups", body, { tier: "WRITE" })

export const patchGroup = (id: string, body: Partial<GroupWriteBody>) =>
  api.patch<GroupDTO>(`/groups/${id}`, body, { tier: "WRITE" })

/**
 * A soft delete. Memberships are end-dated on the same day, and rules that match
 * on this group keep their clause: it simply stops matching anyone (§29.5).
 */
export const deleteGroup = (id: string) =>
  api.delete<GroupDTO>(`/groups/${id}`, { tier: "WRITE" })

export const addGroupMember = (
  id: string,
  body: { employeeId: string; effectiveFrom?: string },
) => api.post<GroupMemberDTO>(`/groups/${id}/members`, body, { tier: "WRITE" })

/** End-dates the membership. `effectiveTo` is exclusive, so today means "not today". */
export const removeGroupMember = (
  id: string,
  employeeId: string,
  effectiveTo?: string,
) =>
  api.delete<GroupMemberDTO>(`/groups/${id}/members/${employeeId}`, {
    tier: "WRITE",
    query: { effectiveTo },
  })
