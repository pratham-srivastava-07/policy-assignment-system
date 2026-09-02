"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button, Skeleton } from "@/components/ui"
import { useSession } from "@/lib/auth"
import { hasWorkspace, ROLE_LABELS } from "@/lib/permissions"

/**
 * §2.1. MANAGER and EMPLOYEE authenticate successfully; the API simply has no
 * workspace for them — `GET /employees` is a 403 for EMPLOYEE — so they get one
 * explanatory page rather than a degraded one.
 */
export const UnavailablePanel = () => {
  const router = useRouter()
  const { status, session, role, signOut } = useSession()
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login")
    if (status === "authenticated" && hasWorkspace(role)) router.replace("/employees")
  }, [status, role, router])

  if (status !== "authenticated" || !session) return <Skeleton className="h-48 w-full" />

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-6">
      <h1 className="text-xl font-semibold text-ink">Not available for your role</h1>
      <p className="text-base text-ink-muted">
        The policy workspace is currently available to administrators. Your policy
        assignments are managed by your HR team.
      </p>
      <p className="text-sm text-ink-subtle">
        Signed in as {session.user.email} · {ROLE_LABELS[session.role]}
      </p>
      <Button
        className="self-start"
        loading={signingOut}
        onClick={() => {
          setSigningOut(true)
          void signOut().then(() => router.replace("/login"))
        }}
      >
        Sign out
      </Button>
    </div>
  )
}
