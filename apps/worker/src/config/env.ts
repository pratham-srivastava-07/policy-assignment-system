import path from "path"
import { z } from "zod"
import dotenv from "dotenv"

/**
 * Anchored to this package, not to the working directory.
 *
 * `dotenv.config()` with no path resolves `.env` against `process.cwd()`, so the
 * process only found its configuration when it happened to be started from the
 * package root. Running it from the repo root — which is where the workspace
 * scripts run — threw a validation error for variables that were sitting in a
 * file three lines away. Resolving from `__dirname` makes the location a
 * property of the package rather than of how it was launched.
 *
 * `src/config` -> package root is two levels up; from the compiled
 * `dist/config` it is the same two, which is why this works in both.
 */
dotenv.config({ path: path.resolve(__dirname, "../../.env") })

/**
 * The worker's environment, validated at import time.
 *
 * It fails on a bad value rather than starting and finding out mid-batch: a
 * relay that comes up pointing at nothing looks healthy while it silently
 * drains no work, which is the worst way for this process to be broken.
 *
 * The tunables all have defaults because there is one obviously right answer for
 * a single-instance deployment, and the ones that matter are the ones an
 * operator reaches for when it stops being single-instance.
 */
export const env = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

    /** How long the relay sleeps between polls when it finds nothing, in ms. */
    OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(50).default(1000),

    /** Rows claimed per poll. Caps how much one crashed relay can strand. */
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(50),

    /**
     * Deliveries of one outbox row before it is left FAILED and stops being
     * retried. Counts enqueue failures only — a claim that expired because the
     * relay died is not an attempt.
     */
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),

    /** First backoff step, in ms. Doubles per attempt from here. */
    OUTBOX_BACKOFF_BASE_MS: z.coerce.number().int().min(100).default(1000),

    /** Ceiling on the backoff, so a long-failing row still retries hourly. */
    OUTBOX_BACKOFF_MAX_MS: z.coerce.number().int().min(1000).default(60 * 60 * 1000),

    /**
     * The claim's visibility timeout, in ms. A row claimed but not marked
     * PROCESSED within this window is handed back to the next poll.
     *
     * It must comfortably exceed the time one batch takes to enqueue, or a slow
     * batch releases rows it is still working on.
     */
    OUTBOX_CLAIM_LEASE_MS: z.coerce.number().int().min(1000).default(60 * 1000),

    /** BullMQ jobs processed at once by this worker process. */
    RECONCILIATION_CONCURRENCY: z.coerce.number().int().min(1).max(100).default(5),

    /** BullMQ's own retries, for a job that fails inside the processor. */
    RECONCILIATION_JOB_ATTEMPTS: z.coerce.number().int().min(1).default(3),
  })
  .parse(process.env)
