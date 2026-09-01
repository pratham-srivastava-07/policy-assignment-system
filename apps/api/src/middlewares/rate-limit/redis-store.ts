import { Redis, Result } from "ioredis"
import { RATE_LIMIT_BUCKET_IDLE_MS, RateLimitTier } from "@policy/shared"
import { MemoryRateLimitStore, RateLimitResult, RateLimitStore } from "./store"

declare module "ioredis" {
  interface RedisCommander<Context> {
    consumeToken(
      key: string,
      capacity: string,
      refillPerSecond: string,
      idleMs: string,
      now: string,
    ): Result<[allowed: number, tokens: string], Context>
  }
}

const KEY_PREFIX = "policy:rl:"

const SCAN_COUNT = 500

const CONSUME_TOKEN_SCRIPT = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillPerSecond = tonumber(ARGV[2])
local idleMs = tonumber(ARGV[3])
local nowArg = ARGV[4]

local now
if nowArg == "" then
  local t = redis.call("TIME")
  now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
else
  now = tonumber(nowArg)
end

local data = redis.call("HMGET", key, "tokens", "updatedAt")
local tokens
local updatedAt

if data[1] == false then
  tokens = capacity
  updatedAt = now
else
  tokens = tonumber(data[1])
  updatedAt = tonumber(data[2])
end

local elapsedSeconds = math.max(0, now - updatedAt) / 1000
tokens = math.min(capacity, tokens + elapsedSeconds * refillPerSecond)

local allowed = 0
if tokens >= 1 then
  allowed = 1
  tokens = tokens - 1
end

redis.call("HMSET", key, "tokens", tostring(tokens), "updatedAt", tostring(now))
redis.call("PEXPIRE", key, idleMs)

return {allowed, tostring(tokens)}
`

const secondsToFull = (tokens: number, tier: RateLimitTier): number => {

  if (tokens >= tier.capacity) {

    return 0
  }

  return Math.ceil((tier.capacity - tokens) / tier.refillPerSecond)
}

const secondsToNextToken = (tokens: number, tier: RateLimitTier): number => {

  if (tokens >= 1) {

    return 0
  }

  return Math.max(1, Math.ceil((1 - tokens) / tier.refillPerSecond))
}

/**
 * Redis-backed store, shared across every API instance.
 *
 * Falls back to an in-memory store on any Redis error rather than failing open
 * or closed: fail-open drops every limit, which is a brute-force hole on the
 * AUTH tier; fail-closed turns a Redis outage into nobody being able to log in.
 * Degraded per-process limits are the safer middle ground.
 */
export class RedisRateLimitStore implements RateLimitStore {

  private readonly fallback: MemoryRateLimitStore

  private redisAvailable = true

  constructor(private readonly redis: Redis, fallback: MemoryRateLimitStore = new MemoryRateLimitStore()) {

    this.fallback = fallback

    this.redis.defineCommand("consumeToken", {
      numberOfKeys: 1,
      lua: CONSUME_TOKEN_SCRIPT,
    })
  }

  async consume(key: string, tier: RateLimitTier, now?: number): Promise<RateLimitResult> {

    try {

      const [allowedFlag, tokensRaw] = await this.redis.consumeToken(
        this.bucketKey(key, tier),
        String(tier.capacity),
        String(tier.refillPerSecond),
        String(RATE_LIMIT_BUCKET_IDLE_MS),
        now === undefined ? "" : String(now),
      )

      this.onRedisSuccess()

      const tokens = Number(tokensRaw)
      const allowed = allowedFlag === 1

      return {
        allowed,
        limit: tier.capacity,
        remaining: Math.floor(tokens),
        resetSeconds: secondsToFull(tokens, tier),
        retryAfterSeconds: allowed ? 0 : secondsToNextToken(tokens, tier),
      }
    } catch (err) {

      this.onRedisFailure(err)

      return this.fallback.consume(key, tier, now)
    }
  }

  async reset(key: string, tier: RateLimitTier): Promise<void> {

    try {

      await this.redis.del(this.bucketKey(key, tier))

      this.onRedisSuccess()
    } catch (err) {

      this.onRedisFailure(err)
    }

    await this.fallback.reset(key, tier)
  }

  async clear(): Promise<void> {

    try {

      await this.deleteByPattern(`${KEY_PREFIX}*`)

      this.onRedisSuccess()
    } catch (err) {

      this.onRedisFailure(err)
    }

    await this.fallback.clear()
  }

  async size(): Promise<number> {

    try {

      const count = await this.countByPattern(`${KEY_PREFIX}*`)

      this.onRedisSuccess()

      return count
    } catch (err) {

      this.onRedisFailure(err)

      return this.fallback.size()
    }
  }

  stop(): void {

    this.fallback.stop()

    this.redis.disconnect()
  }

  private bucketKey(key: string, tier: RateLimitTier): string {

    return `${KEY_PREFIX}${tier.name}:${key}`
  }

  private async countByPattern(pattern: string): Promise<number> {

    let cursor = "0"
    let count = 0

    do {

      const [next, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", SCAN_COUNT)

      cursor = next
      count += keys.length
    } while (cursor !== "0")

    return count
  }

  private async deleteByPattern(pattern: string): Promise<void> {

    let cursor = "0"

    do {

      const [next, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", SCAN_COUNT)

      cursor = next

      if (keys.length > 0) {

        await this.redis.unlink(...keys)
      }
    } while (cursor !== "0")
  }

  private onRedisFailure(err: unknown): void {

    if (this.redisAvailable) {

      this.redisAvailable = false

      console.error("[rate-limit] Redis unreachable, falling back to in-memory store", err)
    }
  }

  private onRedisSuccess(): void {

    if (!this.redisAvailable) {

      this.redisAvailable = true

      console.warn("[rate-limit] Redis reachable again, resuming Redis-backed store")
    }
  }
}
