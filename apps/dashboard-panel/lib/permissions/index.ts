"use client"

import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  roleHasPermission,
  type OrganizationRole,
  type Permission,
} from "@policy/shared"
import { useSession } from "@/lib/auth"

export { PERMISSIONS, ROLE_PERMISSIONS }
export type { Permission, OrganizationRole }

/**
 * §10.1: `GET /auth/me` returns a role, never a permission list. Everything the
 * client knows about what a user may do is derived here.
 */
export const can = (role: OrganizationRole | null, permission: Permission): boolean =>
  role !== null && roleHasPermission(role, permission)

/** The two roles this MVP builds a workspace for (§2.1). */
export const WORKSPACE_ROLES: readonly OrganizationRole[] = ["COMPANY_ADMIN", "HR_ADMIN"]

export const hasWorkspace = (role: OrganizationRole | null): boolean =>
  role !== null && WORKSPACE_ROLES.includes(role)

export const ROLE_LABELS: Record<OrganizationRole, string> = {
  COMPANY_ADMIN: "Company admin",
  HR_ADMIN: "HR admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
}

/**
 * Hiding a control this returns false for is a courtesy, not authorization —
 * the server enforces, and a 403 reaching the UI is a client bug (§10.4).
 */
export const useCan = (permission: Permission): boolean => can(useSession().role, permission)

export const useRole = (): OrganizationRole | null => useSession().role
