"use client"

import { PageHeader } from "@/components/layout"
import { PhasePlaceholder } from "@/components/layout/phase-placeholder"

export default function Page() {
  return (
    <>
      <PageHeader title="Policies" description="What the organization can assign, grouped by category cardinality." />
      <PhasePlaceholder phase={4} builds="Policy list, detail, assigned employees and policy categories." />
    </>
  )
}
