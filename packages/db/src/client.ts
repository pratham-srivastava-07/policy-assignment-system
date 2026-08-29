import { PrismaClient } from "@prisma/client"

/**
 * Single PrismaClient instance shared by every consumer of @policy/db.
 * Cached on globalThis so `tsx watch` reloads don't exhaust the connection pool.
 */
const globalForPrisma = globalThis as unknown as { __policyPrisma?: PrismaClient }

export class PrismaClass {
  private static instance: PrismaClient
  static getInstance(): PrismaClient {
    if (!this.instance) this.instance = globalForPrisma.__policyPrisma ?? new PrismaClient()
    if (process.env.NODE_ENV !== "production") globalForPrisma.__policyPrisma = this.instance
    return this.instance
  }
}

export const prisma: PrismaClient = PrismaClass.getInstance()
