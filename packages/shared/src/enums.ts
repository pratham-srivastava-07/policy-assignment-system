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
