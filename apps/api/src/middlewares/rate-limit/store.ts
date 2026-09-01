/**
 * Token bucket storage.
 *
 * `MemoryRateLimitStore` holds buckets in this Node process's heap, so across N
 * API instances a caller's effective limit is roughly N times the configured
 * one. It is no longer what the API runs on: `RedisRateLimitStore` is, and this
 * is the store it degrades to when Redis is unreachable — per-process limits
 * being a better outage than no limits or no logins.
 */

import {
  RATE_LIMIT_BUCKET_IDLE_MS,
  RATE_LIMIT_SWEEP_INTERVAL_MS,
  RateLimitTier,
} from "@policy/shared"

/** The outcome of trying to spend one token. */
export interface RateLimitResult {
  allowed: boolean
  /** Burst capacity of the bucket, for the `RateLimit-Limit` header. */
  limit: number
  /** Whole tokens left after this attempt, for `RateLimit-Remaining`. */
  remaining: number
  /** Seconds until the bucket is full again, for `RateLimit-Reset`. */
  resetSeconds: number
  /** Seconds until one token is available. Only meaningful when rejected. */
  retryAfterSeconds: number
}

/**
 * Where buckets live.
 *
 * Async by design even though the memory implementation is synchronous — a Redis
 * implementation would not be, and a synchronous interface would have to be
 * rewritten to accommodate it.
 */
export interface RateLimitStore {
  consume(key: string, tier: RateLimitTier, now?: number): Promise<RateLimitResult>
  reset(key: string, tier: RateLimitTier): Promise<void>
  clear(): Promise<void>
  /** Redis cannot answer this synchronously; the memory store still can. */
  size(): number | Promise<number>
  stop(): void
}

interface Bucket {
  /** Tokens available, fractional between whole-token arrivals. */
  tokens: number
  /** When `tokens` was last recomputed, in epoch milliseconds. */
  updatedAt: number
}

export class MemoryRateLimitStore implements RateLimitStore {

  private buckets = new Map<string, Bucket>()

  private sweepTimer: NodeJS.Timeout | null = null

  constructor(sweepIntervalMs: number = RATE_LIMIT_SWEEP_INTERVAL_MS) {

    // Eviction is a periodic sweep rather than lazy-on-access because lazy
    // eviction only ever reclaims a key that is touched again — and the keys
    // worth reclaiming are precisely the ones that never will be. A one-off
    // burst from ten thousand IPs would otherwise be retained forever.
    if (sweepIntervalMs > 0) {

      this.sweepTimer = setInterval(() => this.sweep(), sweepIntervalMs)

      // Never hold the process open on account of rate limit bookkeeping.
      this.sweepTimer.unref?.()
    }
  }

  /**
   * Spends one token, refilling first.
   *
   * Refill is computed lazily from elapsed time rather than driven by a timer:
   *
   *   tokens = min(capacity, tokens + elapsedSeconds * refillPerSecond)
   *
   * so a bucket is only ever touched when its key is used, and a bucket idle for
   * an hour costs exactly the same as one idle for a second. This is what makes
   * it a true token bucket rather than a fixed window — there is no boundary at
   * which everyone's allowance resets at once, and a caller who has been quiet
   * accumulates burst allowance up to `capacity`.
   */
  async consume(
    key: string,
    tier: RateLimitTier,
    now: number = Date.now(),
  ): Promise<RateLimitResult> {

    const bucketKey = this.bucketKey(key, tier)

    const existing = this.buckets.get(bucketKey)

    // An absent bucket is a full one. Storing every key up front would mean
    // remembering callers who have never been throttled.
    const bucket: Bucket = existing ?? {
      tokens: tier.capacity,
      updatedAt: now,
    }

    const elapsedSeconds = Math.max(0, now - bucket.updatedAt) / 1000

    const refilled = Math.min(
      tier.capacity,
      bucket.tokens + elapsedSeconds * tier.refillPerSecond,
    )

    const allowed = refilled >= 1

    bucket.tokens = allowed ? refilled - 1 : refilled
    bucket.updatedAt = now

    this.buckets.set(bucketKey, bucket)

    return {
      allowed,
      limit: tier.capacity,
      remaining: Math.floor(bucket.tokens),
      resetSeconds: this.secondsToFull(bucket.tokens, tier),
      retryAfterSeconds: allowed ? 0 : this.secondsToNextToken(bucket.tokens, tier),
    }
  }

  async reset(key: string, tier: RateLimitTier): Promise<void> {

    this.buckets.delete(this.bucketKey(key, tier))
  }

  async clear(): Promise<void> {

    this.buckets.clear()
  }

  /** Live bucket count. Exposed for diagnostics and for verifying eviction. */
  size(): number {

    return this.buckets.size
  }

  /** Stops the sweep timer. */
  stop(): void {

    if (this.sweepTimer) {

      clearInterval(this.sweepTimer)

      this.sweepTimer = null
    }
  }

  /**
   * Drops buckets untouched for longer than the idle window.
   *
   * Safe because a bucket idle that long has necessarily refilled to capacity,
   * and an absent bucket is treated as full — so eviction is invisible to the
   * caller and simply bounds memory.
   */
  private sweep(now: number = Date.now()): number {

    let evicted = 0

    for (const [key, bucket] of this.buckets) {

      if (now - bucket.updatedAt > RATE_LIMIT_BUCKET_IDLE_MS) {

        this.buckets.delete(key)

        evicted += 1
      }
    }

    return evicted
  }

  /**
   * Namespaces a caller's key by tier.
   *
   * Done here rather than left to the caller so that tier isolation is
   * structural: a user's READ budget and WRITE budget cannot share a bucket even
   * if both are looked up under the same identity string. Relying on every call
   * site to remember to prefix would make a silent cross-tier collision only a
   * forgotten concatenation away.
   */
  private bucketKey(key: string, tier: RateLimitTier): string {

    return `${tier.name}:${key}`
  }

  /** Seconds until the bucket returns to capacity. */
  private secondsToFull(tokens: number, tier: RateLimitTier): number {

    if (tokens >= tier.capacity) {

      return 0
    }

    return Math.ceil((tier.capacity - tokens) / tier.refillPerSecond)
  }

  /** Seconds until at least one whole token exists. */
  private secondsToNextToken(tokens: number, tier: RateLimitTier): number {

    if (tokens >= 1) {

      return 0
    }

    return Math.max(1, Math.ceil((1 - tokens) / tier.refillPerSecond))
  }
}
