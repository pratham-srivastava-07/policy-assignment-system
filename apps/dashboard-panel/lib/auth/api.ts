import type { AuthSessionDTO, MeDTO } from "@policy/shared"
import { api } from "@/lib/api"

export interface LoginInput {
  email: string
  password: string
}

export interface SignupInput {
  name: string
  email: string
  password: string
  organizationName: string
}

export const login = (input: LoginInput) =>
  api.post<AuthSessionDTO>("/auth/login", input, { auth: false, tier: "AUTH" })

/** Always creates a new organization; there is no join-existing path (§2.4). */
export const signup = (input: SignupInput) =>
  api.post<AuthSessionDTO>("/auth/signup", input, { auth: false, tier: "AUTH" })

export const logout = () => api.post<{ success: true }>("/auth/logout", undefined)

export const fetchMe = (signal?: AbortSignal) =>
  api.get<MeDTO>("/auth/me", { signal, tier: "READ" })
