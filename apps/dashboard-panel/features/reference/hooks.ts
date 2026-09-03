"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import * as referenceApi from "./api"

/**
 * Reference lookups.
 *
 * `RuleDTO` carries `policyId`, `AuditEventDTO` carries `actorId`, a group
 * clause carries `groupId`. Rather than an N+1 per row, each list is fetched
 * once under the REFERENCE tier and turned into a Map. A failed lookup renders
 * a truncated id or an explicit "deleted" state, never a blank cell (§17.3,
 * §29.5, §32.3).
 */

export const usePolicies = () =>
  useQuery({
    queryKey: queryKeys.policies({ limit: 100 }),
    queryFn: ({ signal }) => referenceApi.listPolicies({}, signal),
    ...QUERY_TIERS.REFERENCE,
  })

export const useCategories = () =>
  useQuery({
    queryKey: queryKeys.policyCategories(),
    queryFn: ({ signal }) => referenceApi.listCategories(signal),
    ...QUERY_TIERS.REFERENCE,
  })

export const useGroups = () =>
  useQuery({
    queryKey: queryKeys.groups({ limit: 100 }),
    queryFn: ({ signal }) => referenceApi.listGroups({}, signal),
    ...QUERY_TIERS.REFERENCE,
  })

export const useUsers = () =>
  useQuery({
    queryKey: queryKeys.users({ limit: 100 }),
    queryFn: ({ signal }) => referenceApi.listUsers(signal),
    ...QUERY_TIERS.REFERENCE,
  })

const truncateId = (id: string) => `${id.slice(0, 8)}...`

export const usePolicyNames = () => {
  const { data } = usePolicies()

  return useMemo(() => {
    const index = new Map((data?.items ?? []).map((policy) => [policy.id, policy]))

    return {
      policies: data?.items ?? [],
      nameOf: (id: string) => index.get(id)?.name ?? truncateId(id),
      get: (id: string) => index.get(id),
    }
  }, [data])
}

export const useGroupNames = () => {
  const { data } = useGroups()

  return useMemo(() => {
    const index = new Map((data?.items ?? []).map((group) => [group.id, group.name]))

    return {
      groups: data?.items ?? [],
      /** `undefined` means the group is soft-deleted and unreadable (§29.5). */
      nameOf: (id: string) => index.get(id),
    }
  }, [data])
}

export const useCategoryNames = () => {
  const { data } = useCategories()

  return useMemo(() => {
    const index = new Map((data?.items ?? []).map((category) => [category.id, category]))

    return {
      categories: data?.items ?? [],
      get: (id: string) => index.get(id),
      nameOf: (id: string) => index.get(id)?.name ?? truncateId(id),
    }
  }, [data])
}

export const useActorNames = () => {
  const { data } = useUsers()

  return useMemo(() => {
    const index = new Map((data?.items ?? []).map((user) => [user.id, user.name]))

    return {
      /** Null actor means the reconciliation worker, which has no user behind it. */
      nameOf: (id: string | null) =>
        id === null ? "System" : (index.get(id) ?? truncateId(id)),
    }
  }, [data])
}

export const useReconciliationStatus = () =>
  useQuery({
    queryKey: queryKeys.reconciliationStatus(),
    queryFn: ({ signal }) => referenceApi.getReconciliationStatus(signal),
    ...QUERY_TIERS.STATUS,
  })

export const useExplanation = (assignmentId: string | null) =>
  useQuery({
    queryKey: queryKeys.assignmentExplanation(assignmentId ?? "none"),
    queryFn: ({ signal }) => referenceApi.getExplanation(assignmentId!, signal),
    enabled: assignmentId !== null,
    ...QUERY_TIERS.READ,
  })
