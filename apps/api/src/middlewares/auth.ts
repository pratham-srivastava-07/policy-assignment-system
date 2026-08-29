import { NextFunction, Response } from "express"
import { ERROR_CODES } from "@policy/shared"
import { authService } from "../services"
import { AuthedRequest } from "../interfaces/auth"
import { AppError, toHttpError } from "../utils/AppError"
import { extractBearerToken } from "../utils/token"

/**
 * Resolves the bearer token to a session and attaches the resulting identity.
 *
 * This is the only place `req.auth` is ever set, which makes it the only source
 * of organization scope in the application. Nothing downstream may take an
 * organization from a path, body or query parameter — if a handler needs one, it
 * reads `req.auth.organizationId`.
 *
 * Because auth is stateful, a revoked session stops working on the very next
 * request rather than when a token happens to expire.
 */
export const requireAuth = async (
  req: AuthedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {

  try {

    const token = extractBearerToken(req.headers.authorization)

    if (!token) {

      throw new AppError("Authentication required", 401, ERROR_CODES.UNAUTHENTICATED)
    }

    const auth = await authService.resolveSession(token)

    if (!auth) {

      throw new AppError(
        "Session is invalid, expired or revoked",
        401,
        ERROR_CODES.UNAUTHENTICATED,
      )
    }

    req.auth = auth

    next()
  } catch (err) {

    next(toHttpError(err))
  }
}

/**
 * Narrows `req.auth` for handler code.
 *
 * Reaching this with no auth context would mean a route was wired without
 * `requireAuth`, so it fails closed rather than quietly running unscoped.
 */
export const requireAuthContext = (req: AuthedRequest) => {

  if (!req.auth) {

    throw new AppError("Authentication required", 401, ERROR_CODES.UNAUTHENTICATED)
  }

  return req.auth
}
