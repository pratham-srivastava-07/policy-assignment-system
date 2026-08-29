import { ZodError } from "zod"
import { Prisma } from "@policy/db"
import { ERROR_CODES, ErrorCode } from "@policy/shared"
import { AppError as IAppError } from "../interfaces/error"

export class AppError extends Error implements IAppError {

  statusCode: number

  code: ErrorCode

  constructor(
    message: string,
    statusCode = 500,
    code: ErrorCode = ERROR_CODES.INTERNAL_ERROR,
  ) {

    super(message)

    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code

    Error.captureStackTrace?.(this, this.constructor)
  }
}

export const toHttpError = (err: unknown): AppError => {

  if (err instanceof AppError) {

    return err
  }

  if (err instanceof ZodError) {

    const message = err.issues
      .map((issue) => {

        const path = issue.path.join(".")

        return path ? `${path}: ${issue.message}` : issue.message
      })
      .join("; ")

    return new AppError(message || "Invalid payload", 400, ERROR_CODES.VALIDATION_FAILED)
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {

    if (err.code === "P2002") {

      return new AppError(
        "A record with this value already exists",
        409,
        ERROR_CODES.ALREADY_EXISTS,
      )
    }

    if (err.code === "P2025") {

      return new AppError("Resource not found", 404, ERROR_CODES.NOT_FOUND)
    }

    if (err.code === "P2003") {

      return new AppError(
        "A referenced record does not exist",
        409,
        ERROR_CODES.CONFLICT,
      )
    }

    return new AppError("Database request failed", 400, ERROR_CODES.VALIDATION_FAILED)
  }

  if (err instanceof Error) {

    return new AppError(err.message, 500, ERROR_CODES.INTERNAL_ERROR)
  }

  return new AppError(
    "Something went wrong. Please try again",
    500,
    ERROR_CODES.INTERNAL_ERROR,
  )
}
