"use client"

import { PageHeader } from "@/components/layout"
import { PhasePlaceholder } from "@/components/layout/phase-placeholder"

export default function Page() {
  return (
    <>
      <PageHeader title="Settings" description="Organization configuration." />
      <PhasePlaceholder phase={8} builds="Teammates, organization, policy categories and reconciliation events." />
    </>
  )
}
