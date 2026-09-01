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
 * `JWT_SECRET` is read into `SESSION_SECRET`: auth is stateful now, so the value
 * is no longer a JWT signing key but the pepper for session-token HMACs. The
 * variable name is kept so existing `.env` files keep working.
 */
export const env = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    // 6380, not 6379: infra/docker-compose.yml binds Redis there because a
    // Windows redis-server 3.0.504 squats on 6379 locally.
    REDIS_URL: z.string().min(1).default("redis://localhost:6380"),
  })
  .transform((parsed) => ({
    ...parsed,
    SESSION_SECRET: parsed.JWT_SECRET,
  }))
  .parse(process.env)
