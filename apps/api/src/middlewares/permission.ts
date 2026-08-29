/**
 * Authorization.
 *
 * `requireAuth` establishes WHO the caller is. This establishes WHAT they may
 * do. The two are deliberately separate middlewares: conflating them is how
 * authorization ends up implicit, and an endpoint that forgot to check ends up
 * looking identical to one that had nothing to check.
 *
 * Routes declare permissions, never roles. The role → permission mapping lives in
 * exactly one place, `@policy/shared/permissions`.
 */

import { NextFunction, Response } from "express"
import {
  ERROR_CODES,
  Permission,
  isSelfScopedRole,
  roleHasAllPermissions,
} from "@policy/shared"
import { AuthedRequest } from "../interfaces/auth"
import { AppError, toHttpError } from "../utils/AppError"

/**
 * Requires every listed permission.
 *
 * Fails with 403, not 401 — the caller is authenticated, they simply may not do
 * this. Returning 401 would tell a client to re-authenticate, which will not help
 * and invites a pointless login loop.
 *
 * Reaching this without `req.auth` means the route was wired without
 * `requireAuth`. That is a bug, and it fails closed with 401 rather than
 * proceeding unauthorized.
 */
export const requirePermission = (...permissions: Permission[]) => {

  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {

    try {

      const auth = req.auth

      if (!auth) {

        throw new AppError("Authentication required", 401, ERROR_CODES.UNAUTHENTICATED)
      }

      if (!roleHasAllPermissions(auth.role, permissions)) {

        throw new AppError(
          `Role ${auth.role} lacks the required permission: ${permissions.join(", ")}`,
          403,
          ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        )
      }

      next()
    } catch (err) {

      next(toHttpError(err))
    }
  }
}

/**
 * Confines a self-scoped role to its own employee record.
 *
 * A permission answers "may you read employees?" — it cannot answer "which
 * ones?". That second question is per-request data, so it is checked here rather
 * than encoded as another permission string.
 *
 * Applies only to roles in `SELF_SCOPED_ROLES`; every other role passes straight
 * through and is governed by its permissions alone.
 *
 * `paramName` is looked up as a route parameter first and then as a query
 * parameter, because the employee id arrives as `/employees/:id` on some routes
 * and `/access?emp=` on others. A caller whose
 * `AuthContext` carries no `employeeId` — a login with no employee record — is
 * refused outright, since there is no "own record" for them to be confined to.
 */
export const requireSelfOrPermission = (
  paramName: string = "id",
  ...permissions: Permission[]
) => {

  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {

    try {

      const auth = req.auth

      if (!auth) {

        throw new AppError("Authentication required", 401, ERROR_CODES.UNAUTHENTICATED)
      }

      if (!roleHasAllPermissions(auth.role, permissions)) {

        throw new AppError(
          `Role ${auth.role} lacks the required permission: ${permissions.join(", ")}`,
          403,
          ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        )
      }

      if (!isSelfScopedRole(auth.role)) {

        next()

        return
      }

      const fromParams = req.params[paramName]

      const fromQuery = req.query[paramName]

      const requestedId =
        fromParams ?? (typeof fromQuery === "string" ? fromQuery : undefined)

      if (!auth.employeeId) {

        throw new AppError(
          "This login is not linked to an employee record",
          403,
          ERROR_CODES.FORBIDDEN,
        )
      }

      if (requestedId && requestedId !== auth.employeeId) {

        throw new AppError(
          "You may only view your own record",
          403,
          ERROR_CODES.FORBIDDEN,
        )
      }

      next()
    } catch (err) {

      next(toHttpError(err))
    }
  }
}

/**
 * Refuses a self-scoped role outright.
 *
 * For collection endpoints where "your own" has no meaning — listing every
 * employee, or a batch assignment read across arbitrary ids. Narrowing those to
 * the caller would need row-level filtering that does not exist, so the honest
 * answer is 403 rather than a silently truncated list.
 */
export const denySelfScopedRole = () => {

  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {

    try {

      const auth = req.auth

      if (!auth) {

        throw new AppError("Authentication required", 401, ERROR_CODES.UNAUTHENTICATED)
      }

      if (isSelfScopedRole(auth.role)) {

        throw new AppError(
          `Role ${auth.role} may only access its own records`,
          403,
          ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        )
      }

      next()
    } catch (err) {

      next(toHttpError(err))
    }
  }
}
