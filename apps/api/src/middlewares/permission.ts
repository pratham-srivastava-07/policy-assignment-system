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
  AuthContext,
  ERROR_CODES,
  PERMISSIONS,
  Permission,
  isSelfScopedRole,
  isSubtreeScopedRole,
  roleHasAllPermissions,
  roleHasPermission,
  todayIsoDate,
} from "@policy/shared"
import { AuthedRequest } from "../interfaces/auth"
import { AppError, SubtreeReadScope, employeeRepository, toHttpError } from "@policy/core"

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
 * Confines a subtree-scoped role to its own org-chart subtree.
 *
 * The sibling of `requireSelfOrPermission`, one level wider: where a self-scoped
 * role may read exactly its own record, a MANAGER may read their own record and
 * everyone beneath them in `employees.manager_id`, however deep.
 *
 * Their subtree root is `AuthContext.employeeId`, so a login with no linked
 * employee record has no subtree at all and is refused rather than defaulted to
 * the organization. A request that names no employee is refused for the same
 * reason: there is nothing to check the scope against, and passing it through
 * would be an unscoped read.
 *
 * Unlike the other two middlewares here this one does I/O — the subtree is a
 * recursive walk, and only the database can do it. `requireAuth` already
 * resolves a session the same way; an authorization decision that needs a fact
 * about the data has to go and get it. It reaches the repository directly rather
 * than through a service because there is no business logic between the
 * question and the answer.
 *
 * Roles that are not subtree-scoped pass straight through, governed by their
 * permissions alone. It composes with the permission check rather than
 * repeating it, so a route states both: `requirePermission(...)` then this.
 */
export const requireSubtreeScope = (paramName: string = "id") => {

  return async (
    req: AuthedRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = req.auth

      if (!auth) {

        throw new AppError("Authentication required", 401, ERROR_CODES.UNAUTHENTICATED)
      }

      if (!isSubtreeScopedRole(auth.role)) {

        next()

        return
      }

      if (!auth.employeeId) {

        throw new AppError(
          "This login is not linked to an employee record, so it has no reporting line to read",
          403,
          ERROR_CODES.FORBIDDEN,
        )
      }

      const fromParams = req.params[paramName]

      const fromQuery = req.query[paramName]

      // Both sides are narrowed to a single string: a repeated query parameter
      // arrives as an array, and an array is not an employee id.
      const requestedId =
        typeof fromParams === "string"
          ? fromParams
          : typeof fromQuery === "string"
            ? fromQuery
            : undefined

      if (!requestedId) {

        throw new AppError(
          `Role ${auth.role} must name the employee being read`,
          403,
          ERROR_CODES.FORBIDDEN,
        )
      }

      const inSubtree = await employeeRepository.isInSubtree(
        auth.organizationId,
        auth.employeeId,
        requestedId,
      )

      if (!inSubtree) {

        throw new AppError(
          "You may only view employees in your own reporting line",
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
 * The read scope a caller's role confines their COLLECTION reads to.
 *
 * Middleware can answer "may you read THIS employee?" but not "which employees
 * may you read?" — the second is a filter, and a filter belongs in the query. So
 * the controller calls this, hands the result to the service, and the service
 * puts it in the WHERE clause. Trimming the response afterwards would leave
 * `total` and paging counting rows the caller may not see.
 *
 * `null` means unscoped, which is what an admin gets. A subtree-scoped role with
 * no linked employee record is refused here for the same reason as above: no
 * employee record, no reporting line, nothing to scope to.
 */
export const collectionReadScope = (auth: AuthContext): SubtreeReadScope | null => {

  if (!isSubtreeScopedRole(auth.role)) {

    return null
  }

  if (!auth.employeeId) {

    throw new AppError(
      "This login is not linked to an employee record, so it has no reporting line to read",
      403,
      ERROR_CODES.FORBIDDEN,
    )
  }

  return { rootEmployeeId: auth.employeeId }
}

/**
 * Refuses a back-dated write to a caller who may not make one.
 *
 * Back-dating is not a bigger version of writing. An `effectiveFrom` in the past
 * rewrites what the system believes WAS true, and every assignment resolved
 * against that stretch of history moves with it — so it is gated on
 * `employee:backdate`, which only COMPANY_ADMIN and HR_ADMIN hold. Today, the
 * future, and omitting the date entirely are all unaffected.
 *
 * This exists once, here, rather than as a date comparison repeated in five
 * services. Effective dates arrive in the body on most routes and in the query
 * string on `DELETE /groups/:id/members/:employeeId`, so both are inspected. The
 * comparison is a plain string comparison, which is exact for `YYYY-MM-DD` and
 * needs no parsing; anything that is not a well-formed date string is left for
 * the route's Zod schema to reject with a proper validation error.
 */
export const requireBackdatePermission = () => {

  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {

    try {

      const auth = req.auth

      if (!auth) {

        throw new AppError("Authentication required", 401, ERROR_CODES.UNAUTHENTICATED)
      }

      if (roleHasPermission(auth.role, PERMISSIONS.EMPLOYEE_BACKDATE)) {

        next()

        return
      }

      const today = todayIsoDate()

      const supplied = ["effectiveFrom", "effectiveTo"].flatMap((field) => [
        readIsoDateField(req.body, field),
        readIsoDateField(req.query, field),
      ])

      const backdated = supplied.find((value) => value !== null && value < today)

      if (backdated) {

        throw new AppError(
          `Role ${auth.role} may not set an effective date in the past (${backdated})`,
          403,
          ERROR_CODES.BACKDATING_NOT_PERMITTED,
        )
      }

      next()
    } catch (err) {

      next(toHttpError(err))
    }
  }
}

/** One `YYYY-MM-DD` field off an unparsed body or query object, or null. */
const readIsoDateField = (source: unknown, field: string): string | null => {

  if (!source || typeof source !== "object") {

    return null
  }

  const value = (source as Record<string, unknown>)[field]

  return typeof value === "string" ? value : null
}

/**
 * Refuses a self-scoped role outright.
 *
 * For collection endpoints where "your own" has no meaning — listing every
 * employee, or a batch assignment read across arbitrary ids. Narrowing those to
 * the caller would need row-level filtering that does not exist, so the honest
 * answer is 403 rather than a silently truncated list.
 *
 * A subtree-scoped role is NOT refused here: their collections do have a
 * narrowing, so they get the filter (`collectionReadScope`) instead of a 403.
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
