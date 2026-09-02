"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import type { MeDTO, OrganizationRole } from "@policy/shared"
import { configureApiClient, isApiError } from "@/lib/api"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import * as authApi from "./api"
import {
  clearToken,
  getToken,
  setToken,
  subscribeToToken,
  tokenServerSnapshot,
} from "./storage"

/**
 * §9.3: a 401 anywhere clears the token and lands on login with a `next` back to
 * where the user was. A full navigation rather than a router push, because it
 * also discards every cached response that was read with the dead token.
 */
const redirectToLogin = () => {
  clearToken()

  if (typeof window === "undefined") return
  if (window.location.pathname.startsWith("/login")) return

  const next = `${window.location.pathname}${window.location.search}`
  window.location.replace(`/login?next=${encodeURIComponent(next)}`)
}

configureApiClient({ getToken, onAuthFailure: redirectToLogin })

export type SessionStatus = "loading" | "authenticated" | "unauthenticated"

interface SessionValue {
  status: SessionStatus
  session: MeDTO | null
  role: OrganizationRole | null
  signIn: (input: authApi.LoginInput) => Promise<MeDTO>
  signUp: (input: authApi.SignupInput) => Promise<MeDTO>
  signOut: () => Promise<void>
}

const SessionContext = createContext<SessionValue | null>(null)

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()
  const token = useSyncExternalStore(subscribeToToken, getToken, tokenServerSnapshot)
  const hydrating = token === undefined
  const hasToken = typeof token === "string"

  const me = useQuery({
    queryKey: queryKeys.session(),
    queryFn: ({ signal }) => authApi.fetchMe(signal),
    enabled: hasToken,
    ...QUERY_TIERS.REFERENCE,
    // A dead token is not a transient failure; the client has already redirected.
    retry: false,
  })

  const adopt = useCallback(
    async (issued: string) => {
      setToken(issued)

      return queryClient.fetchQuery({
        queryKey: queryKeys.session(),
        queryFn: ({ signal }) => authApi.fetchMe(signal),
      })
    },
    [queryClient],
  )

  const signIn = useCallback(
    async (input: authApi.LoginInput) => adopt((await authApi.login(input)).token),
    [adopt],
  )

  const signUp = useCallback(
    async (input: authApi.SignupInput) => adopt((await authApi.signup(input)).token),
    [adopt],
  )

  const signOut = useCallback(async () => {
    try {
      await authApi.logout()
    } catch (error) {
      // A revoked or expired session is already logged out; anything else is
      // still not a reason to strand the user on a page they cannot use.
      if (!isApiError(error)) throw error
    } finally {
      clearToken()
      queryClient.clear()
    }
  }, [queryClient])

  const status: SessionStatus = hydrating
    ? "loading"
    : !hasToken
      ? "unauthenticated"
      : me.isPending
        ? "loading"
        : me.data
          ? "authenticated"
          : "unauthenticated"

  const value = useMemo<SessionValue>(
    () => ({
      status,
      session: me.data ?? null,
      role: me.data?.role ?? null,
      signIn,
      signUp,
      signOut,
    }),
    [status, me.data, signIn, signUp, signOut],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = (): SessionValue => {
  const value = useContext(SessionContext)

  if (!value) throw new Error("useSession must be used inside a SessionProvider")

  return value
}
