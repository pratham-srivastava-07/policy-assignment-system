import {
  Activity,
  ClipboardList,
  FileText,
  Layers,
  Scale,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react"
import { PERMISSIONS, type Permission } from "@/lib/permissions"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Shown when the role holds at least one of these. Empty means always. */
  requiresAny: readonly Permission[]
}

/**
 * §46. Declared here rather than inside the Settings page so the sidebar can
 * decide whether Settings has anything in it for this role at all.
 */
export const SETTINGS_SECTIONS = [
  {
    href: "/settings/categories",
    label: "Policy categories",
    permission: PERMISSIONS.POLICY_WRITE,
  },
  {
    href: "/settings/reconciliation",
    label: "Reconciliation events",
    permission: PERMISSIONS.ASSIGNMENT_RECONCILE,
  },
  {
    href: "/settings/teammates",
    label: "Teammates",
    permission: PERMISSIONS.MEMBER_WRITE,
  },
  {
    href: "/settings/organization",
    label: "Organization",
    permission: PERMISSIONS.ORG_WRITE,
  },
] as const

const SETTINGS_PERMISSIONS = SETTINGS_SECTIONS.map((section) => section.permission)

/** §6. The primary navigation is intentionally small; no metrics, no decoration. */
export const PRIMARY_NAV: readonly NavItem[] = [
  {
    href: "/employees",
    label: "Employees",
    icon: Users,
    requiresAny: [PERMISSIONS.EMPLOYEE_READ],
  },
  { href: "/rules", label: "Rules", icon: Scale, requiresAny: [PERMISSIONS.RULE_READ] },
  {
    href: "/policies",
    label: "Policies",
    icon: FileText,
    requiresAny: [PERMISSIONS.POLICY_READ],
  },
  { href: "/groups", label: "Groups", icon: Layers, requiresAny: [PERMISSIONS.GROUP_READ] },
  {
    href: "/activity",
    label: "Activity",
    icon: Activity,
    requiresAny: [PERMISSIONS.ASSIGNMENT_RECONCILE],
  },
]

export const SECONDARY_NAV: readonly NavItem[] = [
  {
    href: "/audit",
    label: "Audit",
    icon: ClipboardList,
    requiresAny: [PERMISSIONS.AUDIT_READ],
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    requiresAny: SETTINGS_PERMISSIONS,
  },
]
