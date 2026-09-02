"use client"

import { useEffect, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Skeleton } from "@/components/ui"
import { useSession } from "@/lib/auth"
import { hasWorkspace } from "@/lib/permissions"

const ShellSkeleton = () => (
  <div className="flex min-h-dvh flex-col gap-px p-6" role="status" aria-label="Loading">
    <Skeleton className="h-14 w-full" />
    <Skeleton className="h-64 w-full" />
  </div>
)

/**
 * §2.1: MANAGER and EMPLOYEE authenticate successfully and are sent to a single
 * explanatory page. This is a scoping decision, not a permission failure.
 */
export const AuthGuard = ({ children }: { children: ReactNode }) => {
  const { status, role } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const workspace = hasWorkspace(role)

  useEffect(() => {
    if (status === "unauthenticated") {
      const query = searchParams.toString()
      const next = query ? `${pathname}?${query}` : pathname
      router.replace(`/login?next=${encodeURIComponent(next)}`)
      return
    }

    if (status === "authenticated" && !workspace) router.replace("/unavailable")
  }, [status, workspace, router, pathname, searchParams])

  if (status !== "authenticated" || !workspace) return <ShellSkeleton />

  return <>{children}</>
}
