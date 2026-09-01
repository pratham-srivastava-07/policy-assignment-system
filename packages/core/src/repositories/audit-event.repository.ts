import { AuditEvent, Prisma, PrismaClass } from "@policy/db"
import { AuditAction, AuditEntityType } from "@policy/shared"
import { TxClient } from "../interfaces/db"

export interface CreateAuditEventRecord {
  /** NULL for system-initiated changes, e.g. the reconciliation worker. */
  actorId: string | null
  action: AuditAction | string
  entityType: AuditEntityType | string
  entityId: string
  beforeState?: unknown
  afterState?: unknown
  metadata?: unknown
}

/** Filters the audit feed may narrow on. */
export interface AuditEventFilters {
  entityType?: string
  entityId?: string
  actorId?: string
  /** Inclusive lower bound on `created_at`. */
  from?: Date
  /** Exclusive upper bound on `created_at`. */
  to?: Date
  search?: string
}

/**
 * The who / what / when / before / after log.
 *
 * Always written inside the same transaction as the change it describes — a
 * state change whose audit record went missing has lost the traceability the
 * product is built on.
 *
 * Append-only: no update or delete. `entityId` is a plain string rather than a
 * foreign key so the trail survives deletion of the row it describes.
 */
class AuditEventRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {

    if (value === undefined || value === null) {

      return undefined
    }

    return value as Prisma.InputJsonValue
  }

  async record(
    organizationId: string,
    data: CreateAuditEventRecord,
    tx?: TxClient,
  ): Promise<AuditEvent> {

    return this.db(tx).auditEvent.create({
      data: {
        organizationId,
        actorId: data.actorId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        beforeState: this.toJson(data.beforeState),
        afterState: this.toJson(data.afterState),
        metadata: this.toJson(data.metadata),
      },
    })
  }

  /** "What has happened to this one entity?" — the audit drawer. */
  async findForEntity(
    organizationId: string,
    entityType: string,
    entityId: string,
    options: { limit: number; offset: number },
    tx?: TxClient,
  ): Promise<AuditEvent[]> {

    return this.db(tx).auditEvent.findMany({
      where: {
        organizationId,
        entityType,
        entityId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: options.limit,
      skip: options.offset,
    })
  }

  /** The filtered feed behind `GET /audit-events`. */
  async findMany(
    organizationId: string,
    filters: AuditEventFilters,
    options: { limit: number; offset: number },
    tx?: TxClient,
  ): Promise<AuditEvent[]> {

    return this.db(tx).auditEvent.findMany({
      where: this.buildWhere(organizationId, filters),
      orderBy: {
        createdAt: "desc",
      },
      take: options.limit,
      skip: options.offset,
    })
  }

  async count(
    organizationId: string,
    filters: AuditEventFilters,
    tx?: TxClient,
  ): Promise<number> {

    return this.db(tx).auditEvent.count({
      where: this.buildWhere(organizationId, filters),
    })
  }

  private buildWhere(
    organizationId: string,
    filters: AuditEventFilters,
  ): Prisma.AuditEventWhereInput {

    const where: Prisma.AuditEventWhereInput = {
      organizationId,
      ...(filters.entityType !== undefined && { entityType: filters.entityType }),
      ...(filters.entityId !== undefined && { entityId: filters.entityId }),
      ...(filters.actorId !== undefined && { actorId: filters.actorId }),
    }

    if (filters.from !== undefined || filters.to !== undefined) {

      where.createdAt = {
        ...(filters.from !== undefined && { gte: filters.from }),
        ...(filters.to !== undefined && { lt: filters.to }),
      }
    }

    if (filters.search !== undefined) {

      where.OR = [
        { action: { contains: filters.search, mode: "insensitive" } },
        { entityType: { contains: filters.search, mode: "insensitive" } },
      ]
    }

    return where
  }

  /** The org-wide activity feed. */
  async findForOrganization(
    organizationId: string,
    options: { limit: number; offset: number },
    tx?: TxClient,
  ): Promise<AuditEvent[]> {

    return this.db(tx).auditEvent.findMany({
      where: {
        organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: options.limit,
      skip: options.offset,
    })
  }
}

export { AuditEventRepository }
