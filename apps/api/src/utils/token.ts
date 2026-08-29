import crypto from "node:crypto"
import { env } from "../config/env"

/**
 * Session token minting and hashing.
 *
 * Auth is stateful: the token is an opaque random string with no claims baked
 * into it, and authority comes from the `sessions` row it resolves to. That is
 * what makes server-side logout possible — a JWT cannot be un-issued.
 *
 * Only the HMAC digest is stored. Read access to the `sessions` table therefore
 * does not hand an attacker a usable bearer token, because the secret lives in
 * the environment rather than the database.
 *
 * HMAC-SHA256 rather than bcrypt on purpose: the token is 256 bits of entropy,
 * not a guessable password, so it needs no work factor — and the digest has to
 * be computable in one pass so a lookup can be a single indexed equality.
 */

const TOKEN_BYTES = 32

export const generateSessionToken = (): string => {

  return crypto.randomBytes(TOKEN_BYTES).toString("base64url")
}

export const hashSessionToken = (token: string): string => {

  return crypto.createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex")
}

/** Reads a `Authorization: Bearer <token>` header. */
export const extractBearerToken = (header: string | undefined): string | null => {

  if (!header) {

    return null
  }

  const [scheme, token] = header.split(" ")

  if (scheme !== "Bearer" || !token) {

    return null
  }

  return token
}
