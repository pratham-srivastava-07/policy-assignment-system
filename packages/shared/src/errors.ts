/**
 * Stable error codes.
 *
 * These are the machine-readable half of an error response; the human-readable
 * half is the message. Clients branch on the code, never on the message text.
 */
export const ERROR_CODES = {
  // Auth
  UNAUTHENTICATED: "UNAUTHENTICATED",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  FORBIDDEN: "FORBIDDEN",
  INSUFFICIENT_PERMISSIONS: "INSUFFICIENT_PERMISSIONS",

  // Tenancy
  ORGANIZATION_MISMATCH: "ORGANIZATION_MISMATCH",
  NO_ORGANIZATION_MEMBERSHIP: "NO_ORGANIZATION_MEMBERSHIP",

  // Generic resource lifecycle
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  CONFLICT: "CONFLICT",

  // Throttling
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",

  // Domain
  CARDINALITY_VIOLATION: "CARDINALITY_VIOLATION",
  INVALID_EFFECTIVE_RANGE: "INVALID_EFFECTIVE_RANGE",
  INVALID_RULE_CONDITIONS: "INVALID_RULE_CONDITIONS",
  MANUAL_RULE_REQUIRES_EMPLOYEE: "MANUAL_RULE_REQUIRES_EMPLOYEE",

  /**
   * The proposed manager cannot hold that position: they do not exist in this
   * organization, they are the employee themselves, or they have been
   * terminated.
   */
  INVALID_MANAGER: "INVALID_MANAGER",
  /**
   * The proposed manager already reports — directly or through a chain — to the
   * employee being reassigned. Accepting it would close a loop in the org chart.
   */
  MANAGER_CYCLE: "MANAGER_CYCLE",
  /**
   * An effective date earlier than today was supplied by a caller who does not
   * hold `employee:backdate`.
   */
  BACKDATING_NOT_PERMITTED: "BACKDATING_NOT_PERMITTED",

  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
