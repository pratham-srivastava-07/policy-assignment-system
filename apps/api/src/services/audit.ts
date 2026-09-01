import {
  AUDIT_ENTITY_TYPES,
  AuditEventDTO,
  ERROR_CODES,
  Page,
  fromIsoDate,
} from "@policy/shared"
import { AuditEventRepository, EmployeeRepository } from "@policy/core"
import { AuditServiceInterface } from "../interfaces/rule"
import { EmployeeAuditQuery, ListAuditEventsQuery } from "../validators"
import { AppError } from "@policy/core"
import { toAuditEventDTO } from "@policy/core"

/**
 * The audit feed.
 *
 * Read-only over HTTP: rows are written transactionally by the service that made
 * the change, never by a client. An audit log a client can write to is not an
 * audit log.
 */
export class AuditService implements AuditServiceInterface {

  constructor(
    private audit: AuditEventRepository,
    private employees: EmployeeRepository,
  ) {}

  async list(
    organizationId: string,
    query: ListAuditEventsQuery,
  ): Promise<Page<AuditEventDTO>> {

    const filters = {
      entityType: query.entityType,
      entityId: query.entityId,
      actorId: query.actorId,
      from: query.from ? fromIsoDate(query.from) : undefined,
      to: query.to ? fromIsoDate(query.to) : undefined,
      search: query.search,
    }

    const [rows, total] = await Promise.all([
      this.audit.findMany(organizationId, filters, query),
      this.audit.count(organizationId, filters),
    ])

    return {
      items: rows.map(toAuditEventDTO),
      total,
      limit: query.limit,
      offset: query.offset,
    }
  }

  /** One employee's history — the audit drawer on their record. */
  async listForEmployee(
    organizationId: string,
    employeeId: string,
    query: EmployeeAuditQuery,
  ): Promise<Page<AuditEventDTO>> {

    const employee = await this.employees.findById(organizationId, employeeId)

    if (!employee) {

      throw new AppError("Employee not found", 404, ERROR_CODES.NOT_FOUND)
    }

    const filters = {
      entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
      entityId: employeeId,
    }

    const [rows, total] = await Promise.all([
      this.audit.findMany(organizationId, filters, query),
      this.audit.count(organizationId, filters),
    ])

    return {
      items: rows.map(toAuditEventDTO),
      total,
      limit: query.limit,
      offset: query.offset,
    }
  }
}
