"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Badge, Button, Skeleton } from "@/components/ui"
import { useSession } from "@/lib/auth"
import { ROLE_LABELS } from "@/lib/permissions"

/**
 * The organization record (design.md §46.4).
 *
 * Read-only, because the API exposes no organization write endpoint. Showing the
 * id matters more than it looks: it is the tenant boundary every request is
 * scoped by, and it is the first thing worth quoting in a support conversation.
 */

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border py-3 last:border-b-0">
    <span className="w-40 shrink-0 text-sm text-ink-muted">{label}</span>
    <span className="min-w-0 text-sm text-ink">{value}</span>
  </div>
)

export default function Page() {
  const { session, role } = useSession()

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/settings">
          <ArrowLeft aria-hidden />
          Settings
        </Link>
      </Button>

      <PageHeader
        title="Organization"
        description="The tenant every employee, rule and assignment in this workspace belongs to."
      />

      {session === null ? (
        <Skeleton className="h-40 w-full max-w-2xl" />
      ) : (
        <div className="max-w-2xl rounded-md border border-border px-4">
          <Row label="Name" value={session.organization.name} />
          <Row
            label="Organization id"
            value={<span className="font-mono text-xs">{session.organization.id}</span>}
          />
          <Row label="Signed in as" value={session.user.name} />
          <Row label="Email" value={session.user.email} />
          <Row
            label="Your role"
            value={
              <span className="flex items-center gap-2">
                {role ? ROLE_LABELS[role] : "Unknown"}
                {role ? <Badge tone="outline">{role}</Badge> : null}
              </span>
            }
          />
        </div>
      )}

      <p className="mt-3 max-w-2xl text-xs text-ink-subtle">
        Every request is scoped to this organization by the session, never by anything in a
        URL or request body. That is the boundary that keeps one tenant out of another.
      </p>
    </>
  )
}
