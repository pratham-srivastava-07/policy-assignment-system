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
  RULE_UPDATED: "rule.updated",
  RULE_ENABLED: "rule.enabled",
  RULE_DISABLED: "rule.disabled",
  RULE_PRIORITY_CHANGED: "rule.priority_changed",
  RULE_DELETED: "rule.deleted",

  OVERRIDE_CREATED: "override.created",
  OVERRIDE_DELETED: "override.deleted",

  EMPLOYEE_TERMINATED: "employee.terminated",

  ASSIGNMENT_CREATED: "assignment.created",
  ASSIGNMENT_ENDED: "assignment.ended",

  RECONCILIATION_RAN: "reconciliation.ran",
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
  RULE_UPDATED: "rule.updated",
  RULE_ENABLED: "rule.enabled",
  RULE_DISABLED: "rule.disabled",
  RULE_PRIORITY_CHANGED: "rule.priority_changed",
  RULE_DELETED: "rule.deleted",

  OVERRIDE_CREATED: "override.created",
  OVERRIDE_DELETED: "override.deleted",

  EMPLOYEE_TERMINATED: "employee.terminated",

  ASSIGNMENT_CREATED: "assignment.created",
  ASSIGNMENT_ENDED: "assignment.ended",

  RECONCILIATION_RAN: "reconciliation.ran",
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

/**
 * Default priority bands, one per rule type.
 *
 * These are used for exactly two things and nothing else:
 *
 *   1. the priority a rule gets when it is created WITHOUT an explicit one;
 *   2. the second key of the resolution sort, so that two rules that were given
 *      the same explicit priority still order deterministically.
 *
 * Priority itself is the sole authority for who wins. A DEPARTMENT rule at
 * priority 900 beats a MANUAL rule at priority 100 — the band does not
 * re-enter the comparison once the numbers differ. The bands only encode what a
 * sensible starting number looks like for each dimension.
 */
export const RULE_TYPE_PRIORITY_BANDS = {
  MANUAL: 1000,
  ROLE: 800,
  DEPARTMENT: 600,
  LOCATION: 400,
  TENURE: 300,
  GROUP: 200,
  DEFAULT: 100,
} as const

export type RuleTypePriorityBand =
  (typeof RULE_TYPE_PRIORITY_BANDS)[keyof typeof RULE_TYPE_PRIORITY_BANDS]

/**
 * The `policy_categories.key` that the `/access` endpoints read.
 *
 * Application access is derived like every other assignment — there is no way to
 * write an access assignment directly. `/access` is a filtered view over the
 * assignments in this category, and granting access means creating a MANUAL
 * override rule that produces a policy inside it.
 */
export const APPLICATION_ACCESS_CATEGORY_KEY = "application_access"
