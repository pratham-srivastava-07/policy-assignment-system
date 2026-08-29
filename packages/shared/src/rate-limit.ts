/**
 * Rate limit tiers.
 *
 * A tier is a token bucket shape plus the thing it is counted against. Keeping
 * them here rather than inline in the routers means the limits are configuration
 * that can be read in one sitting, not magic numbers scattered across a dozen
 * files.
 *
 * `docs/architecture.md` asks for limits at different levels — per user, per
 * organization, per IP — and for expensive operations to be held to stricter
 * limits than simple reads. That is exactly the split below.
 */

/** What a bucket is counted against. */
export const RATE_LIMIT_SCOPES = ["ip", "user", "organization"] as const

export type RateLimitScope = (typeof RATE_LIMIT_SCOPES)[number]

export interface RateLimitTier {
  /** Identifies the bucket family. Part of the key, so tiers never share a bucket. */
  readonly name: string
  /** What the bucket is counted against. */
  readonly scope: RateLimitScope
  /**
   * Burst allowance — the most requests that can be made back to back from a
   * full bucket.
   */
  readonly capacity: number
  /** Sustained rate, in tokens per second. */
  readonly refillPerSecond: number
}

/**
 * The tiers.
 *
 * On capacity vs. sustained rate: a token bucket's capacity is its burst
 * allowance and need not equal the per-window count. Capacity governs how bursty
 * a caller may be; `refillPerSecond` governs what they may sustain. Every tier
 * below sets capacity well under the per-minute rate, because real clients arrive
 * in short bursts — a page that fires six reads on mount should not be shaped,
 * but a client that opens the tap and leaves it running should be.
 */
export const RATE_LIMIT_TIERS = {
  /**
   * Unauthenticated credential endpoints: signup and login.
   *
   * 10 per 15 minutes, keyed by IP. Far stricter than anything else here because
   * these are the only endpoints reachable without a session, which makes them
   * the brute-force surface. Capacity equals the full allowance — there is no
   * legitimate reason to spread ten login attempts out, so the whole budget is
   * available at once and then simply runs dry.
   */
  AUTH: {
    name: "auth",
    scope: "ip",
    capacity: 10,
    refillPerSecond: 10 / (15 * 60),
  },

  /**
   * Ordinary authenticated reads. 300/minute sustained, keyed by user.
   *
   * Generous, because reads are cheap and a busy admin screen legitimately makes
   * many. Capacity of 60 absorbs a page load that fans out without letting a
   * runaway client sustain five requests a second forever.
   */
  READ: {
    name: "read",
    scope: "user",
    capacity: 60,
    refillPerSecond: 300 / 60,
  },

  /**
   * Authenticated writes. 60/minute sustained, keyed by user.
   *
   * Lower than reads: every write here costs a transaction, an audit row and
   * usually an outbox row. Capacity of 20 covers a bulk edit done by hand.
   */
  WRITE: {
    name: "write",
    scope: "user",
    capacity: 20,
    refillPerSecond: 60 / 60,
  },

  /**
   * Engine-backed operations. 20/minute sustained, keyed by ORGANIZATION.
   *
   * These evaluate rules across a population — simulation, rule preview,
   * employee preview, reconciliation, batch assignment reads. Cost scales with
   * headcount, not with request size, so one caller can hurt everyone in the
   * tenant. Keyed by organization for exactly that reason: the limit protects
   * the tenant's shared capacity, so a single user cannot spend it all.
   *
   * Capacity of 5 keeps a burst from pinning the process while still allowing a
   * handful of simulations while a rule is being tuned.
   */
  EXPENSIVE: {
    name: "expensive",
    scope: "organization",
    capacity: 5,
    refillPerSecond: 20 / 60,
  },
} as const satisfies Record<string, RateLimitTier>

export type RateLimitTierName = keyof typeof RATE_LIMIT_TIERS

/**
 * How long an idle bucket is kept before it may be evicted.
 *
 * A bucket that has sat untouched for longer than this has necessarily refilled
 * to capacity, so discarding it and letting the next request build a fresh full
 * bucket is indistinguishable from keeping it — while bounding memory.
 */
export const RATE_LIMIT_BUCKET_IDLE_MS = 15 * 60 * 1000

/** How often the in-memory store sweeps for idle buckets. */
export const RATE_LIMIT_SWEEP_INTERVAL_MS = 5 * 60 * 1000
