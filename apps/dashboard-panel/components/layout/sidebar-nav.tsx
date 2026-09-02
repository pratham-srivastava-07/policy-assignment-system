"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { can, useRole } from "@/lib/permissions"
import { useAsOf, withAsOf } from "@/lib/dates"
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "./nav-items"

/**
 * `responsive` is the persistent sidebar: icons only on tablet, labelled from
 * 1280 px up (§43). `expanded` is the mobile sheet, which is always labelled.
 */
type NavMode = "responsive" | "expanded"

const isCurrent = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`)

const NavLink = ({
  item,
  mode,
  onNavigate,
}: {
  item: NavItem
  mode: NavMode
  onNavigate?: () => void
}) => {
  const pathname = usePathname()
  const { asOf } = useAsOf()
  const current = isCurrent(pathname, item.href)
  const Icon = item.icon

  return (
    <Link
      href={withAsOf(item.href, asOf)}
      aria-current={current ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md text-sm transition-colors duration-150 ease-out",
        mode === "responsive" ? "justify-center lg:justify-start lg:px-2" : "px-2",
        current
          ? "bg-surface font-medium text-ink"
          : "text-ink-muted hover:bg-surface hover:text-ink",
      )}
    >
      <Icon className="size-5 shrink-0" aria-hidden />
      <span className={cn(mode === "responsive" && "sr-only lg:not-sr-only")}>
        {item.label}
      </span>
    </Link>
  )
}

export const SidebarNav = ({
  mode = "responsive",
  onNavigate,
}: {
  mode?: NavMode
  onNavigate?: () => void
}) => {
  const role = useRole()
  const visible = (item: NavItem) =>
    item.requiresAny.length === 0 ||
    item.requiresAny.some((permission) => can(role, permission))

  return (
    <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-2">
      {PRIMARY_NAV.filter(visible).map((item) => (
        <NavLink key={item.href} item={item} mode={mode} onNavigate={onNavigate} />
      ))}
      <hr className="my-2 border-border" />
      {SECONDARY_NAV.filter(visible).map((item) => (
        <NavLink key={item.href} item={item} mode={mode} onNavigate={onNavigate} />
      ))}
    </nav>
  )
}
