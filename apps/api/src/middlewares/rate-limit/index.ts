/**
 * Rate limiting middleware.
 *
 * One exported factory per tier. A router asks for the shape of limit it wants —
 * `rateLimit.read()`, `rateLimit.expensive()` — and never states a number, so the
 * limits stay configuration in `@policy/shared` rather than magic scattered
 * through the routers.
 *
 * Ordering matters. The user- and organization-keyed tiers read `req.auth`, so
 * they must be mounted AFTER `requireAuth`. The IP-keyed AUTH tier guards the two
 * endpoints that have no session yet, so it is mounted before anything else.
 */

import { NextFunction, Response } from "express"
import {
  ERROR_CODES,
  RATE_LIMIT_TIERS,
  RateLimitTier,
} from "@policy/shared"
import { AuthedRequest } from "../../interfaces/auth"
import { AppError, toHttpError } from "../../utils/AppError"
import { MemoryRateLimitStore, RateLimitStore } from "./store"

export { MemoryRateLimitStore } from "./store"

export type { RateLimitResult, RateLimitStore } from "./store"

/**
 * The process-wide store.
 *
 * Module-level so every tier shares one map and one sweep timer. Swapping this
 * for a Redis-backed store is the only change needed to make limits shared
 * across instances.
 */
export const rateLimitStore: RateLimitStore = new MemoryRateLimitStore()

/**
 * Builds the bucket key.
 *
 * Identity only. The store namespaces by tier itself, so a caller's READ budget
 * and WRITE budget are separate buckets without this having to remember to say so.
 *
 * A scope with no identity available fails closed onto the IP. That only happens
 * if a user-scoped tier is mounted without `requireAuth` in front of it, which
 * would be a wiring bug; falling back to the IP keeps the limit meaningful
 * instead of silently letting everyone share one bucket.
 */
const buildKey = (req: AuthedRequest, tier: RateLimitTier): string => {

  const ip = req.ip ?? req.socket.remoteAddress ?? "unknown"

  if (tier.scope === "ip") {

    return `ip:${ip}`
  }

  if (tier.scope === "user") {

    return req.auth ? `user:${req.auth.userId}` : `ip:${ip}`
  }

  return req.auth ? `org:${req.auth.organizationId}` : `ip:${ip}`
}

/**
 * Builds a middleware for one tier.
 *
 * The `RateLimit-*` headers are set on every request the limiter handles, not
 * only on rejections, so a well-behaved client can see itself approaching the
 * limit and back off before it is turned away.
 */
export const rateLimiter = (tier: RateLimitTier) => {

  return async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const result = await rateLimitStore.consume(buildKey(req, tier), tier)

      res.setHeader("RateLimit-Limit", result.limit)
      res.setHeader("RateLimit-Remaining", result.remaining)
      res.setHeader("RateLimit-Reset", result.resetSeconds)

      if (!result.allowed) {

        res.setHeader("Retry-After", result.retryAfterSeconds)

        throw new AppError(
          `Rate limit exceeded. Retry in ${result.retryAfterSeconds}s`,
          429,
          ERROR_CODES.RATE_LIMIT_EXCEEDED,
        )
      }

      next()
    } catch (err) {

      next(toHttpError(err))
    }
  }
}

/**
 * The tiers, ready to mount.
 *
 * Each is a factory rather than a shared instance so a router reads as a
 * declaration of intent — `rateLimit.write()` beside the route it guards.
 */
export const rateLimit = {

  /** Unauthenticated credential endpoints. Keyed by IP. */
  auth: () => rateLimiter(RATE_LIMIT_TIERS.AUTH),

  /** Ordinary authenticated reads. Keyed by user. */
  read: () => rateLimiter(RATE_LIMIT_TIERS.READ),

  /** Authenticated writes. Keyed by user. */
  write: () => rateLimiter(RATE_LIMIT_TIERS.WRITE),

  /** Engine-backed operations. Keyed by organization. */
  expensive: () => rateLimiter(RATE_LIMIT_TIERS.EXPENSIVE),
}
