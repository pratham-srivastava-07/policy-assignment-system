import { NextFunction, Request, Response } from "express"
import { ERROR_CODES } from "@policy/shared"
import { AppError } from "../interfaces/error"
import { env } from "../config/env"

export const globalErrorHandler = (
  err: AppError,
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
