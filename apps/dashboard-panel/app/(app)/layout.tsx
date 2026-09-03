"use client"

import { Suspense, type ReactNode } from "react"
import { AppShell, AuthGuard } from "@/components/layout"
import { ReconciliationStreamProvider } from "@/lib/stream"

/**
 * The stream is opened inside the guard, so it is never attempted without a
 * session, and once for the whole workspace, so navigating between views does
 * not tear down and rebuild the connection.
 */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AuthGuard>
        <ReconciliationStreamProvider>
          <AppShell>{children}</AppShell>
        </ReconciliationStreamProvider>
      </AuthGuard>
    </Suspense>
  )
}
