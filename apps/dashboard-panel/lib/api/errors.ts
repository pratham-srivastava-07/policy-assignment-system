import { ERROR_CODES, type ErrorCode } from "@policy/shared"

export const AUTH_FAILURE_CODES: readonly string[] = [
  ERROR_CODES.UNAUTHENTICATED,
  ERROR_CODES.SESSION_EXPIRED,
  ERROR_CODES.SESSION_REVOKED,
]

export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode | string
  /** Seconds until the caller may retry. Only ever set on a 429 (§40.5). */
  readonly retryAfterSeconds: number | null
  readonly path: string

  constructor(init: {
    message: string
    status: number
    code: ErrorCode | string
    path: string
    retryAfterSeconds?: number | null
  }) {
    super(init.message)
    this.name = "ApiError"
    this.status = init.status
    this.code = init.code
    this.path = init.path
    this.retryAfterSeconds = init.retryAfterSeconds ?? null
  }

  get isAuthFailure(): boolean {
    return this.status === 401 && AUTH_FAILURE_CODES.includes(this.code)
  }

  get isRateLimited(): boolean {
    return this.status === 429 || this.code === ERROR_CODES.RATE_LIMIT_EXCEEDED
  }

  get isForbidden(): boolean {
    return (
      this.code === ERROR_CODES.FORBIDDEN ||
      this.code === ERROR_CODES.INSUFFICIENT_PERMISSIONS
    )
  }

  get isNotFound(): boolean {
    return this.code === ERROR_CODES.NOT_FOUND
  }
}

/** The request never reached the API: offline, DNS, CORS, aborted transport. */
export class NetworkError extends Error {
  readonly path: string

  constructor(path: string, cause?: unknown) {
    super("Could not reach the API")
    this.name = "NetworkError"
    this.path = path
    this.cause = cause
  }
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError

export const isNetworkError = (error: unknown): error is NetworkError =>
  error instanceof NetworkError

export const errorCodeOf = (error: unknown): ErrorCode | string | null =>
  isApiError(error) ? error.code : null

/**
 * design.md §40.3, minus the codes that never reach a rendered surface:
 * the three auth failures are intercepted by the client (§9.3), and the field-
 * level codes are rendered by the form that owns the field.
 */
export const ERROR_HEADLINES: Record<string, string> = {
  [ERROR_CODES.INVALID_CREDENTIALS]: "That email and password do not match",
  [ERROR_CODES.FORBIDDEN]: "You do not have access to this",
  [ERROR_CODES.INSUFFICIENT_PERMISSIONS]: "You do not have access to this",
  [ERROR_CODES.NOT_FOUND]: "Not found",
  [ERROR_CODES.VALIDATION_FAILED]: "That change was rejected",
  [ERROR_CODES.ALREADY_EXISTS]: "That already exists",
  [ERROR_CODES.CARDINALITY_VIOLATION]:
    "This category allows one policy per employee",
  [ERROR_CODES.INVALID_EFFECTIVE_RANGE]: "Those effective dates are not valid",
  [ERROR_CODES.BACKDATING_NOT_PERMITTED]:
    "You do not have permission to record past-dated changes",
  [ERROR_CODES.MANAGER_CYCLE]: "That manager would create a reporting loop",
  [ERROR_CODES.INVALID_MANAGER]: "That person cannot be this employee's manager",
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: "Too many requests right now",
  [ERROR_CODES.CONFLICT]: "That conflicts with the current state",
  [ERROR_CODES.ORGANIZATION_MISMATCH]: "That record belongs to another organization",
  [ERROR_CODES.NO_ORGANIZATION_MEMBERSHIP]:
    "This account does not belong to an organization",
  [ERROR_CODES.INVALID_RULE_CONDITIONS]: "Those rule conditions are not valid",
  [ERROR_CODES.MANUAL_RULE_REQUIRES_EMPLOYEE]:
    "A manual rule must name the employee it applies to",
  [ERROR_CODES.INTERNAL_ERROR]: "The server could not complete this",
}

/** A headline for any error. Never returns a bare "Something went wrong" (§40.3). */
export const headlineFor = (error: unknown): string => {
  if (isNetworkError(error)) return "Could not reach the API"

  if (isApiError(error)) {
    return ERROR_HEADLINES[error.code] ?? "The server could not complete this"
  }

  return "The page could not be loaded"
}

/** The server's own text: Zod issues joined into one string (§40.2). */
export const detailFor = (error: unknown): string | null => {
  if (isNetworkError(error)) {
    return "Check that the API is running and reachable from this browser."
  }

  return isApiError(error) ? error.message : null
}
