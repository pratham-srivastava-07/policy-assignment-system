import type { OrganizationRole, Page, PublicUser } from "@policy/shared"
import { api } from "@/lib/api"

/** Teammates. The organization always comes from the session, never the body. */

export interface TeammateWriteBody {
  name: string
  email: string
  password: string
  role: OrganizationRole
  employeeId?: string | null
}

export const listTeammates = (
  page: { limit: number; offset: number },
  signal?: AbortSignal,
) => api.get<Page<PublicUser>>("/user", { signal, tier: "READ", query: page })

export const createTeammate = (body: TeammateWriteBody) =>
  api.post<PublicUser>("/user", body, { tier: "WRITE" })

/** Role is not patchable through this endpoint, so the form does not offer it. */
export const patchTeammate = (
  id: string,
  body: { name?: string; email?: string; password?: string; employeeId?: string | null },
) => api.patch<PublicUser>(`/user/${id}`, body, { tier: "WRITE" })

export const removeTeammate = (id: string) =>
  api.delete<PublicUser>(`/user/${id}`, { tier: "WRITE" })
