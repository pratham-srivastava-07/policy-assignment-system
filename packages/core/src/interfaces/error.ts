import { ErrorCode } from "@policy/shared"

export interface AppError extends Error {
  statusCode?: number
  /** Stable machine-readable code from @policy/shared. */
  code?: ErrorCode
}
