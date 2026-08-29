/**
 * Domain enums.
 *
 * These mirror the Postgres enum types declared in
 * `packages/db/prisma/schema.prisma`, but are intentionally re-declared here as
 * plain string unions so that consumers who have no business importing Prisma
 * (validators, DTOs, a future UI) can still speak the vocabulary.
 *
 * The `as const` object + derived union pattern gives both a runtime value list
 * (for validation and iteration) and a compile-time type.
 */

/** How many policies from one category an employee may hold at a time. */
export const CARDINALITIES = ["SINGLE", "MULTIPLE"] as const

export type Cardinality = (typeof CARDINALITIES)[number]

/** Lifecycle of a policy. */
export const POLICY_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const

export type PolicyStatus = (typeof POLICY_STATUSES)[number]

/**
 * The dimension an assignment rule matches on.
 *
 * MANUAL is an explicit, single-employee override. It is a rule like any other
 * so that every assignment has exactly one explainable source rule.
 *
 * DEFAULT is the organization-wide catch-all.
 */
export const RULE_TYPES = [
  "MANUAL",
  "ROLE",
  "DEPARTMENT",
  "LOCATION",
  "TENURE",
  "GROUP",
  "DEFAULT",
] as const

export type RuleType = (typeof RULE_TYPES)[number]

/** Whether an assignment came from automatic evaluation or a manual override. */
export const RESOLUTION_STATUSES = ["AUTOMATIC", "MANUAL_OVERRIDE"] as const

export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number]

/** Roles a user can hold within an organization. */
export const ORGANIZATION_ROLES = [
  "COMPANY_ADMIN",
  "HR_ADMIN",
  "MANAGER",
  "EMPLOYEE",
] as const

export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number]

/** Transactional-outbox row lifecycle. */
export const OUTBOX_STATUSES = [
  "PENDING",
  "PROCESSING",
  "PROCESSED",
  "FAILED",
] as const

export type OutboxStatus = (typeof OUTBOX_STATUSES)[number]

/**
 * The outcome recorded for one rule in one evaluation.
 *
 * Every rule the engine looked at gets exactly one of these, winners and losers
 * alike — that is what makes "why does employee X have assignment Y?" a query
 * rather than an archaeology exercise.
 *
 *   MATCHED_WON              - conditions matched and the rule produced the assignment
 *   MATCHED_LOST             - conditions matched but a higher-ordered rule won a
 *                              SINGLE-cardinality category
 *   NOT_MATCHED              - the employee did not satisfy the conditions
 *   SKIPPED_DISABLED         - the rule is disabled
 *   SKIPPED_OUT_OF_WINDOW    - the as-of date falls outside the rule's effective window
 *   SKIPPED_POLICY_INACTIVE  - the rule's policy is DRAFT or ARCHIVED
 */
export const RESOLUTION_DECISIONS = [
  "MATCHED_WON",
  "MATCHED_LOST",
  "NOT_MATCHED",
  "SKIPPED_DISABLED",
  "SKIPPED_OUT_OF_WINDOW",
  "SKIPPED_POLICY_INACTIVE",
] as const

export type ResolutionDecision = (typeof RESOLUTION_DECISIONS)[number]

/**
 * Employment lifecycle.
 *
 * Employees are never hard-deleted: a departure is a TERMINATED status plus a
 * termination date, so the assignment history that hangs off the row survives.
 * Terminated employees are excluded from resolution.
 */
export const EMPLOYEE_STATUSES = ["ACTIVE", "TERMINATED"] as const

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number]
