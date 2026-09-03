"use client"

import { Suspense, useState, type ReactNode } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import {
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
  TooltipProvider,
} from "@/components/ui"
import { useSession } from "@/lib/auth"
import { AsOfControl, HistoricalModeBanner } from "./as-of-control"
import { SidebarNav } from "./sidebar-nav"
import { UserMenu } from "./user-menu"
import { BacklogIndicator, StreamIndicator } from "./stream-indicator"
import { CommandMenu, CommandMenuTrigger } from "@/components/command-menu"

const OrganizationMark = () => {
  const { session } = useSession()

  return (
    <Link href="/employees" className="flex min-w-0 items-center gap-2">
      <span className="truncate text-sm font-semibold text-ink">
        {session?.organization.name ?? "Policy"}
      </span>
      <span className="hidden text-sm text-ink-subtle md:inline">· Policy</span>
    </Link>
  )
}

/**
 * §7. The command palette (§33) and the reconciliation backlog indicator (§31.3)
 * belong in this strip. Both are later phases and neither is faked here: an
 * indicator that cannot say anything true is worse than an empty space.
 */
const HeaderSlots = () => (
  <>
    <CommandMenuTrigger />
    <BacklogIndicator />
    <StreamIndicator />
  </>
)

export const AppShell = ({ children }: { children: ReactNode }) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-dvh flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 md:px-6">
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu aria-hidden />
            </Button>
            <SheetContent side="left" className="p-0">
              <SheetTitle className="border-b border-border p-4">Navigation</SheetTitle>
              <SidebarNav mode="expanded" onNavigate={() => setMobileNavOpen(false)} />
            </SheetContent>
          </Sheet>

          <OrganizationMark />

          <div className="ml-auto flex items-center gap-2">
            <HeaderSlots />
            <Suspense fallback={null}>
              <AsOfControl />
            </Suspense>
            <UserMenu />
          </div>
        </header>

        <Suspense fallback={null}>
          <HistoricalModeBanner />
        </Suspense>

        <div className="flex flex-1 items-stretch">
          <aside className="hidden w-14 shrink-0 border-r border-border md:flex md:flex-col lg:w-56">
            <Suspense fallback={null}>
              <SidebarNav />
            </Suspense>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-content px-4 py-6 md:px-6">{children}</div>
          </main>
        </div>
      </div>
      <CommandMenu />
    </TooltipProvider>
  )
}
