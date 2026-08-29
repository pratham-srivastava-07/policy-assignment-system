import { NextFunction, Request, Response } from "express"
import { ERROR_CODES } from "@policy/shared"
import { AppErrorShape } from "@policy/core"
import { env } from "../config/env"

/**
 * The structural error shape is `AppErrorShape` rather than `AppError`: the
 * class and the interface both moved to `@policy/core`, where the class keeps
 * the plain name every `throw` site uses. This handler wants the shape, because
 * what reaches it is whatever `toHttpError` normalized, not necessarily an
 * instance.
 */
export const globalErrorHandler = (
  err: AppErrorShape,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {

  const statusCode = err.statusCode || 500

  if (statusCode >= 500) {

    console.error(err)
  }

  return res.status(statusCode).json({
    success: false,
    message: err.message || "Something went wrong. Please try again",
    code: err.code || ERROR_CODES.INTERNAL_ERROR,
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  })
}
