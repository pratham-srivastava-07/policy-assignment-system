"use client"

import { PageHeader } from "@/components/layout"
import { PhasePlaceholder } from "@/components/layout/phase-placeholder"

export default function Page() {
  return (
    <>
      <PageHeader title="Groups" description="Membership that assignment rules can match on." />
      <PhasePlaceholder phase={6} builds="Group list, detail and effective-dated membership." />
    </>
  )
}
