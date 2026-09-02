"use client"

import { Suspense, type ReactNode } from "react"
import { AppShell, AuthGuard } from "@/components/layout"

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <AppShell>{children}</AppShell>
      </AuthGuard>
    </Suspense>
  )
}
