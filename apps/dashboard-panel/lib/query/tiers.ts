import type { DefaultOptions } from "@tanstack/react-query"
import { isApiError } from "@/lib/api"

type QueryDefaults = NonNullable<DefaultOptions["queries"]>

const MINUTE = 60_000

/**
 * Never retry something the server answered deliberately. A 4xx will fail the
 * same way three times; only transport failures and 5xx are worth repeating,
 * and a 429 is never repeated at all (§40.5).
 */
const retryTransientOnly = (failureCount: number, error: unknown) => {
  if (isApiError(error) && (error.status < 500 || error.isRateLimited)) return false

  return failureCount < 2
}

/**
 * design.md §35.2. Pick the tier that matches the endpoint's cost, not the one
 * that feels convenient — EXPENSIVE spends an organization-wide budget of 5.
 */
export const QUERY_TIERS = {
  /** Lists and details. */
  READ: {
    staleTime: 30_000,
    gcTime: 5 * MINUTE,
    refetchOnWindowFocus: true,
    retry: retryTransientOnly,
  },

  /** Policies, categories, groups — the data behind pickers. */
  REFERENCE: {
    staleTime: 5 * MINUTE,
    gcTime: 30 * MINUTE,
    refetchOnWindowFocus: false,
    retry: retryTransientOnly,
  },

  /**
   * preview · simulate · matching-employees · reconcile · batch assignments.
   * Cached until something invalidates it, refetched automatically by nothing.
   */
  EXPENSIVE: {
    staleTime: Infinity,
    gcTime: 30 * MINUTE,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  },

  /** `GET /reconciliation/status`, polled only while the tab is focused (§31.3). */
  STATUS: {
    staleTime: 30_000,
    gcTime: 5 * MINUTE,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: retryTransientOnly,
  },
} as const satisfies Record<string, QueryDefaults>

export type QueryTier = keyof typeof QUERY_TIERS
