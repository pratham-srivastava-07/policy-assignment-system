/**
 * Audit action vocabulary written to `audit_events.action`.
 *
 * Kept as string constants rather than a Postgres enum so that new actions can
 * be added without a migration — an audit log that is expensive to extend stops
 * getting extended.
 */
export const AUDIT_ACTIONS = {
  ORGANIZATION_CREATED: "organization.created",

  USER_CREATED: "user.created",
  USER_UPDATED: "user.updated",
  USER_DELETED: "user.deleted",

  SESSION_CREATED: "session.created",
  SESSION_REVOKED: "session.revoked",

  EMPLOYEE_CREATED: "employee.created",
  EMPLOYEE_UPDATED: "employee.updated",
  EMPLOYEE_DELETED: "employee.deleted",

  GROUP_CREATED: "group.created",
  GROUP_UPDATED: "group.updated",
  GROUP_DELETED: "group.deleted",
  GROUP_MEMBER_ADDED: "group.member_added",
  GROUP_MEMBER_REMOVED: "group.member_removed",

  POLICY_CATEGORY_CREATED: "policy_category.created",
  POLICY_CATEGORY_UPDATED: "policy_category.updated",
  POLICY_CATEGORY_DELETED: "policy_category.deleted",

  POLICY_CREATED: "policy.created",
  POLICY_UPDATED: "policy.updated",
  POLICY_DELETED: "policy.deleted",

  RULE_CREATED: "rule.created",
  RULE_ENABLED: "rule.enabled",
  RULE_DISABLED: "rule.disabled",
} as const

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS]

/** `audit_events.entity_type` values. */
export const AUDIT_ENTITY_TYPES = {
  ORGANIZATION: "organization",
  USER: "user",
  SESSION: "session",
  EMPLOYEE: "employee",
  GROUP: "group",
  EMPLOYEE_GROUP: "employee_group",
  POLICY: "policy",
  POLICY_CATEGORY: "policy_category",
  POLICY_RULE: "policy_rule",
  ASSIGNMENT: "assignment",
} as const

export type AuditEntityType =
  (typeof AUDIT_ENTITY_TYPES)[keyof typeof AUDIT_ENTITY_TYPES]

/**
 * `outbox_events.event_type` values — the reconciliation triggers listed in
 * docs/architecture.md § Reconciliation Worker.
 *
 * A row is written inside the same transaction as the state change it describes;
 * the relay (not built) turns it into a queue job.
 */
export const OUTBOX_EVENT_TYPES = {
  EMPLOYEE_ATTRIBUTES_CHANGED: "employee.attributes_changed",
  EMPLOYEE_CREATED: "employee.created",
  EMPLOYEE_DELETED: "employee.deleted",
  GROUP_MEMBERSHIP_CHANGED: "group.membership_changed",
  GROUP_DELETED: "group.deleted",

  // Rule changes fan out to a population rather than one employee: the worker
  // resolves who is affected from the rule's own conditions.
  RULE_CREATED: "rule.created",
  RULE_ENABLED: "rule.enabled",
  RULE_DISABLED: "rule.disabled",
} as const

export type OutboxEventType =
  (typeof OUTBOX_EVENT_TYPES)[keyof typeof OUTBOX_EVENT_TYPES]

/** `outbox_events.aggregate_type` values. */
export const OUTBOX_AGGREGATE_TYPES = {
  EMPLOYEE: "employee",
  GROUP: "group",
  POLICY_RULE: "policy_rule",
} as const

export type OutboxAggregateType =
  (typeof OUTBOX_AGGREGATE_TYPES)[keyof typeof OUTBOX_AGGREGATE_TYPES]

/**
 * Employee columns whose change is recorded in `employee_attribute_history` and
 * can therefore alter policy assignments.
 *
 * These are the condition attributes that live on the employee row, plus
 * `hireDate`: `tenureDays` is derived from the hire date, so a corrected hire
 * date is what has to be recorded for a tenure rule to be explainable after the
 * fact.
 *
 * `groupId` is absent because group membership has its own effective-dated
 * table, and `tenureDays` is absent because it is never stored.
 */
export const TRACKED_EMPLOYEE_ATTRIBUTES = [
  "department",
  "state",
  "country",
  "location",
  "employmentType",
  "role",
  "isManager",
  "hireDate",
] as const

export type TrackedEmployeeAttribute =
  (typeof TRACKED_EMPLOYEE_ATTRIBUTES)[number]

/** Session lifetime, in seconds. 7 days. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7

/** bcrypt cost factor used for both user passwords and nothing else. */
export const PASSWORD_SALT_ROUNDS = 12

/** Default and maximum page sizes for list endpoints. */
export const DEFAULT_PAGE_SIZE = 25

export const MAX_PAGE_SIZE = 100
