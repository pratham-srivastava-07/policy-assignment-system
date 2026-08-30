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
  /**
   * Supplying an effective date earlier than today on any write.
   *
   * Back-dating is not a bigger version of writing — it rewrites what the system
   * believes was true in the past, and every assignment resolved against that
   * past moves with it. So it is a permission of its own rather than a corner of
   * `employee:write`, and it is held by the upper-management roles only.
   *
   * Despite the `employee:` prefix it governs every effective-dated write:
   * employee attributes, group membership and rule windows. The prefix names
   * where back-dating is felt — an employee's history — not the one table it
   * applies to. Splitting it three ways would let a caller rewrite one half of
   * an employee's past and not the other, which is worse than one honest gate.
   */
  EMPLOYEE_BACKDATE: "employee:backdate",

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
 *   overrides, back-dated ones included. Deliberately cannot reshape the
 *   organization or change who has access to it — that separation is the point
 *   of having two admin roles.
 *
 * MANAGER
 *   Reads, never writes, and reads only their own org-chart subtree: themselves
 *   and everyone beneath them, however deep. `employees.manager_id` is what
 *   makes that boundary definable — before the org chart existed this role read
 *   org-wide for want of anything to narrow it to.
 *
 *   Like EMPLOYEE's self-scoping, the narrowing is not expressible as a
 *   permission string: a permission answers "may you read employees?", not
 *   "which ones?". It is enforced by the subtree check in the permission
 *   middleware for single-record reads, and pushed into the query as a filter
 *   for collection reads.
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

/**
 * Roles whose reads are confined to their own org-chart subtree.
 *
 * The subtree root is the caller's own employee record, so a role listed here
 * that has no linked employee record has no scope at all and is refused rather
 * than handed the organization.
 *
 * Deliberately disjoint from `SELF_SCOPED_ROLES`: a self-scoped role is already
 * narrower than any subtree, and running both narrowings over one request would
 * be two answers to the same question.
 */
export const SUBTREE_SCOPED_ROLES: readonly OrganizationRole[] = ["MANAGER"]

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

/** Whether `role` may only ever read inside its own org-chart subtree. */
export const isSubtreeScopedRole = (role: OrganizationRole): boolean => {

  return SUBTREE_SCOPED_ROLES.includes(role)
}
