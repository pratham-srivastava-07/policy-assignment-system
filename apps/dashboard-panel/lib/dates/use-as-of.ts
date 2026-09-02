"use client"

import { useCallback, useMemo } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ASOF_PARAM, isHistorical, readAsOf, type AsOf } from "./as-of"

/**
 * §8 + §34. The URL is the source of truth for the global time control; nothing
 * mirrors it in a store. `asOf` is absent from the URL whenever it is today.
 */
export const useAsOf = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const asOf = useMemo(() => readAsOf(searchParams), [searchParams])

  const setAsOf = useCallback(
    (next: AsOf) => {
      const params = new URLSearchParams(searchParams.toString())

      if (isHistorical(next)) {
        params.set(ASOF_PARAM, next)
      } else {
        params.delete(ASOF_PARAM)
      }

      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams],
  )

  return { asOf, setAsOf, historical: isHistorical(asOf) }
}
