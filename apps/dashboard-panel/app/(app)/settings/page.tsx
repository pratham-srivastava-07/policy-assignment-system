"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { PageHeader } from "@/components/layout"
import { SETTINGS_SECTIONS } from "@/components/layout/nav-items"
import { EmptyState } from "@/components/ui"
import { can, useRole } from "@/lib/permissions"

/**
 * Settings is an index rather than a page (design.md §46). Each section is
 * gated by the permission it actually needs, so a role that holds none of them
 * sees an honest explanation instead of four links that all return 403.
 */

const SECTION_BLURB: Record<string, string> = {
  "/settings/categories":
    "The groupings policies live in, and the cardinality that decides whether they compete.",
  "/settings/reconciliation":
    "The outbox behind reconciliation: what is pending, what failed, and how far behind the relay is.",
  "/settings/teammates": "Who can sign in to this workspace, and with which role.",
  "/settings/organization": "The organization this workspace belongs to.",
}

export default function Page() {
  const role = useRole()
  const visible = SETTINGS_SECTIONS.filter((section) => can(role, section.permission))

  return (
    <>
      <PageHeader title="Settings" description="Organization configuration." />

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing here for your role."
          description="Settings covers policy categories, reconciliation, teammates and the organization record. Your role holds none of those permissions."
        />
      ) : (
        <ul className="flex max-w-2xl flex-col divide-y divide-border rounded-md border border-border bg-bg">
          {visible.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                className="flex items-center gap-3 px-3 py-3 transition-colors duration-150 hover:bg-surface"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium text-ink">{section.label}</span>
                  <span className="text-xs text-ink-subtle">
                    {SECTION_BLURB[section.href]}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
