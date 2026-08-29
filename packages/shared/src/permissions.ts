/**
 * Permissions and the role that grants them.
 *
 * `docs/architecture.md` is explicit that authorization should be expressed as
 * permission strings rather than role-name checks scattered through route
 * handlers. A handler asks "may this caller write rules?", never "is this caller
 * an HR admin?" — which means adding a role later is an edit to one table in
 * this file instead of a hunt through every router.
 *
 * This module is pure data. It performs no I/O and knows nothing about HTTP; the
 * middleware that enforces it lives in `apps/api/src/middlewares/permission.ts`.
 */

import { OrganizationRole } from "./enums"

/**
 * Every permission in the system.
 *
 * The `resource:action` shape is deliberate — it keeps the vocabulary small and
 * makes an unhandled resource obvious at a glance.
 */
export const PERMISSIONS = {
  EMPLOYEE_READ: "employee:read",
  EMPLOYEE_WRITE: "employee:write",

  GROUP_READ: "group:read",
  GROUP_WRITE: "group:write",

  POLICY_READ: "policy:read",
  POLICY_WRITE: "policy:write",

  RULE_READ: "rule:read",
  RULE_WRITE: "rule:write",

  ASSIGNMENT_READ: "assignment:read",
  ASSIGNMENT_OVERRIDE: "assignment:override",
  /** Trigger materialization. Writes derived state, but is not an override. */
  ASSIGNMENT_RECONCILE: "assignment:reconcile",

  AUDIT_READ: "audit:read",

  ORG_READ: "org:read",
  ORG_WRITE: "org:write",

  MEMBER_READ: "member:read",
  MEMBER_WRITE: "member:write",
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** Every permission, as a list — the grant set for an unrestricted role. */
export const ALL_PERMISSIONS: readonly Permission[] = Object.values(PERMISSIONS)

/** Every read-only permission. The grant set for a role that may look, not touch. */
export const READ_ONLY_PERMISSIONS: readonly Permission[] = ALL_PERMISSIONS.filter(
  (permission) => permission.endsWith(":read"),
)

/**
 * Role to permission mapping — the single place this relationship is defined.
 *
 * COMPANY_ADMIN
 *   Owns the tenant. Everything, including managing the organization itself and
 *   who belongs to it.
 *
 * HR_ADMIN
 *   Runs people operations day to day: employees, groups, policies, rules and
 *   overrides. Deliberately cannot reshape the organization or change who has
 *   access to it — that separation is the point of having two admin roles.
 *
 * MANAGER
 *   Reads, never writes.
 *
 *   DECISION: `docs/architecture.md` describes a manager seeing "relevant
 *   employees" — their reports. The schema has no `manager_id` and no org chart,
 *   so "relevant" has no definition to enforce. Rather than invent a reporting
 *   structure, MANAGER currently reads org-wide. Narrowing this to a subtree is
 *   blocked on an org chart being modelled first.
 *
 * EMPLOYEE
 *   Sees their own record and their own policy state, and nothing else. The
 *   narrowing to "own" is not expressible as a permission string — a permission
 *   answers "may you read employees?", not "which ones?" — so it is enforced
 *   separately by the self-scoping check in the permission middleware.
 */
export const ROLE_PERMISSIONS: Record<OrganizationRole, readonly Permission[]> = {
  COMPANY_ADMIN: ALL_PERMISSIONS,

  HR_ADMIN: ALL_PERMISSIONS.filter(
    (permission) =>
      permission !== PERMISSIONS.ORG_WRITE && permission !== PERMISSIONS.MEMBER_WRITE,
  ),

  MANAGER: READ_ONLY_PERMISSIONS,

  EMPLOYEE: [PERMISSIONS.EMPLOYEE_READ, PERMISSIONS.ASSIGNMENT_READ],
}

/**
 * Roles whose reads are confined to their own employee record.
 *
 * Kept as a set rather than an `=== "EMPLOYEE"` comparison so that adding, say, a
 * CONTRACTOR role with the same confinement is a one-line change.
 */
export const SELF_SCOPED_ROLES: readonly OrganizationRole[] = ["EMPLOYEE"]

/** Whether `role` carries `permission`. */
export const roleHasPermission = (
  role: OrganizationRole,
  permission: Permission,
): boolean => {

  return ROLE_PERMISSIONS[role].includes(permission)
}

/**
 * Whether `role` carries every one of `permissions`.
 *
 * All-of rather than any-of: a route that declares two permissions is saying it
 * genuinely does both things, so holding half of them is not enough.
 */
export const roleHasAllPermissions = (
  role: OrganizationRole,
  permissions: readonly Permission[],
): boolean => {

  return permissions.every((permission) => roleHasPermission(role, permission))
}

/** Whether `role` may only ever read its own employee record. */
export const isSelfScopedRole = (role: OrganizationRole): boolean => {

  return SELF_SCOPED_ROLES.includes(role)
}
