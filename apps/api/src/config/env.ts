import { z } from "zod"
import dotenv from "dotenv"

dotenv.config()

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
  })
  .transform((parsed) => ({
    ...parsed,
    SESSION_SECRET: parsed.JWT_SECRET,
  }))
  .parse(process.env)
