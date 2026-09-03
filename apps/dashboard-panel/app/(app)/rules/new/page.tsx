"use client"

import { Suspense } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Button, SkeletonRows } from "@/components/ui"
import { RuleEditor } from "@/features/rules/rule-editor"

export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/rules">
          <ArrowLeft aria-hidden />
          Rules
        </Link>
      </Button>

      <PageHeader
        title="New rule"
        description="Say who it applies to, which policy they receive, and how it ranks against the rules it competes with."
      />

      <RuleEditor />
    </Suspense>
  )
}
