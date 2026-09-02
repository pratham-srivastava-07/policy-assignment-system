"use client"

import { PageHeader } from "@/components/layout"
import { PhasePlaceholder } from "@/components/layout/phase-placeholder"

export default function Page() {
  return (
    <>
      <PageHeader title="Audit" description="What changed, who changed it, and when." />
      <PhasePlaceholder phase={7} builds="Global audit log with search and filters." />
    </>
  )
}
