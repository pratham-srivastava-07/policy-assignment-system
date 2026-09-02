"use client"

import { PageHeader } from "@/components/layout"
import { PhasePlaceholder } from "@/components/layout/phase-placeholder"

export default function Page() {
  return (
    <>
      <PageHeader title="Rules" description="Which employees receive which policy, and in what order rules win." />
      <PhasePlaceholder phase={5} builds="Rule list, detail, condition builder, simulation and version history." />
    </>
  )
}
