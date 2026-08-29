import { PrismaClass, Session } from "@policy/db"
import { TxClient } from "../interfaces/db"

/**
 * Stateful sessions.
 *
 * The raw bearer token never reaches this layer — callers pass its HMAC digest.
 * A session is usable while `revokedAt IS NULL AND expiresAt > now()`, which is
 * exactly what `findActiveByTokenHash` asks for, so a revoked or expired token
 * simply does not resolve.
 */
class SessionRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  async create(
    data: {
      userId: string
      organizationId: string
      tokenHash: string
      expiresAt: Date
    },
    tx?: TxClient,
  ): Promise<Session> {

    return this.db(tx).session.create({
      data,
    })
  }

  async findActiveByTokenHash(
    tokenHash: string,
    now: Date = new Date(),
    tx?: TxClient,
  ): Promise<Session | null> {

    return this.db(tx).session.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
    })
  }

  async touch(id: string, at: Date = new Date(), tx?: TxClient): Promise<void> {

    await this.db(tx).session.update({
      where: {
        id,
      },
      data: {
        lastSeenAt: at,
      },
    })
  }

  /** Logout. Idempotent: revoking an already-revoked session is a no-op. */
  async revoke(id: string, at: Date = new Date(), tx?: TxClient): Promise<number> {

    const result = await this.db(tx).session.updateMany({
      where: {
        id,
        revokedAt: null,
      },
      data: {
        revokedAt: at,
      },
    })

    return result.count
  }

  /** Revoke every live session for a user — password change, offboarding. */
  async revokeAllForUser(
    userId: string,
    at: Date = new Date(),
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: at,
      },
    })

    return result.count
  }
}

export { SessionRepository }
