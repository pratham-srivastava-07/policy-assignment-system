"use client"

import { PageHeader } from "@/components/layout"
import { PhasePlaceholder } from "@/components/layout/phase-placeholder"

export default function Page() {
  return (
    <>
      <PageHeader title="Employees" description="The primary workspace. Every policy assignment is reached from here." />
      <PhasePlaceholder phase={2} builds="Employee list, detail, create, edit with preview, and terminate." />
    </>
  )
}
