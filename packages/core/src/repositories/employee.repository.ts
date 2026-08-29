import { Employee, EmployeeStatus, Prisma, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"
import {
  CreateEmployeeRecord,
  EmployeeListOptions,
  UpdateEmployeeRecord,
} from "../interfaces/employee"
import { CandidateFilter } from "../engine/candidates"

/**
 * Employees.
 *
 * Every method takes `organizationId` first and constrains on it — including the
 * single-row reads, which use `findFirst` rather than `findUnique` precisely so
 * the tenant predicate cannot be dropped. A caller holding a valid employee id
 * from another organization gets `null`, not a row.
 */
class EmployeeRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  /** Translates list filters into a tenant-scoped WHERE clause. */
  private buildWhere(
    organizationId: string,
    options: Partial<EmployeeListOptions>,
  ): Prisma.EmployeeWhereInput {

    const where: Prisma.EmployeeWhereInput = {
      organizationId,
    }

    if (options.department !== undefined) where.department = options.department
    if (options.state !== undefined) where.state = options.state
    if (options.country !== undefined) where.country = options.country
    if (options.location !== undefined) where.location = options.location
    if (options.employmentType !== undefined) where.employmentType = options.employmentType
    if (options.role !== undefined) where.role = options.role
    if (options.isManager !== undefined) where.isManager = options.isManager
    if (options.status !== undefined) where.status = options.status

    if (options.search) {

      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { email: { contains: options.search, mode: "insensitive" } },
      ]
    }

    return where
  }

  async create(
    organizationId: string,
    data: CreateEmployeeRecord,
    tx?: TxClient,
  ): Promise<Employee> {

    return this.db(tx).employee.create({
      data: {
        ...data,
        organizationId,
      },
    })
  }

  async findById(
    organizationId: string,
    id: string,
    tx?: TxClient,
  ): Promise<Employee | null> {

    return this.db(tx).employee.findFirst({
      where: {
        id,
        organizationId,
      },
    })
  }

  async findByEmail(
    organizationId: string,
    email: string,
    tx?: TxClient,
  ): Promise<Employee | null> {

    return this.db(tx).employee.findFirst({
      where: {
        email,
        organizationId,
      },
    })
  }

  async findMany(
    organizationId: string,
    options: EmployeeListOptions,
    tx?: TxClient,
  ): Promise<Employee[]> {

    return this.db(tx).employee.findMany({
      where: this.buildWhere(organizationId, options),
      orderBy: {
        name: "asc",
      },
      take: options.limit,
      skip: options.offset,
    })
  }

  async count(
    organizationId: string,
    options: Partial<EmployeeListOptions> = {},
    tx?: TxClient,
  ): Promise<number> {

    return this.db(tx).employee.count({
      where: this.buildWhere(organizationId, options),
    })
  }

  /**
   * Tenant-safe update: the WHERE carries the organization, so an id from
   * another tenant updates zero rows and reports it via the returned count.
   */
  async update(
    organizationId: string,
    id: string,
    data: UpdateEmployeeRecord,
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).employee.updateMany({
      where: {
        id,
        organizationId,
      },
      data,
    })

    return result.count
  }

  /**
   * Every ACTIVE employee in the organization.
   *
   * Unpaginated on purpose: the callers are the population sweeps behind
   * /rules/:id/matching-employees and /rules/simulate, which cannot page in the
   * database — whether an employee matches is only known after the engine has
   * run, so the page has to be taken from the evaluated result.
   */
  async findAllActive(organizationId: string, tx?: TxClient): Promise<Employee[]> {

    return this.db(tx).employee.findMany({
      where: {
        organizationId,
        status: "ACTIVE",
      },
      orderBy: {
        name: "asc",
      },
    })
  }

  /**
   * Active employees that could match a rule, given a narrowed filter.
   *
   * This is the fan-out query: when a rule changes, it answers "who might this
   * affect?" without loading the organization. Every field on the filter is an
   * AND, and the filter only ever contains clauses that were safe to push down,
   * so this can return rows that do not ultimately match — the caller finishes
   * the job by evaluating the residual clauses in the engine. It never omits a
   * row that does match, which is the property that matters.
   *
   * An empty filter selects every active employee, which is correct: a rule with
   * no narrowable conditions really does affect everyone. `isUnnarrowed` lets a
   * caller see that coming.
   *
   * Group membership is a join rather than a column, and is filtered on
   * memberships that are open as of `asOf` using the same half-open predicate as
   * everywhere else.
   */
  async findCandidates(
    organizationId: string,
    filter: CandidateFilter,
    asOf: Date,
    tx?: TxClient,
  ): Promise<Employee[]> {

    const where: Prisma.EmployeeWhereInput = {
      organizationId,
      status: "ACTIVE",
    }

    if (filter.department) where.department = { in: filter.department }
    if (filter.state) where.state = { in: filter.state }
    if (filter.country) where.country = { in: filter.country }
    if (filter.location) where.location = { in: filter.location }
    if (filter.employmentType) where.employmentType = { in: filter.employmentType }
    if (filter.role) where.role = { in: filter.role }

    if (filter.isManager !== undefined) where.isManager = filter.isManager

    if (filter.hireDateFrom || filter.hireDateTo) {

      where.hireDate = {
        ...(filter.hireDateFrom ? { gte: filter.hireDateFrom } : {}),
        ...(filter.hireDateTo ? { lte: filter.hireDateTo } : {}),
      }
    }

    if (filter.groupIds && filter.groupIds.length > 0) {

      where.groupMemberships = {
        some: {
          groupId: {
            in: filter.groupIds,
          },
          effectiveFrom: {
            lte: asOf,
          },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gt: asOf } },
          ],
        },
      }
    }

    return this.db(tx).employee.findMany({
      where,
      orderBy: {
        name: "asc",
      },
    })
  }

  /**
   * Termination — what `DELETE /employees/:id` now does.
   *
   * The row survives, because every assignment, audit event and resolution event
   * that names this employee has to stay explainable after they leave.
   */
  async terminate(
    organizationId: string,
    id: string,
    terminatedOn: Date,
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).employee.updateMany({
      where: {
        id,
        organizationId,
        status: "ACTIVE",
      },
      data: {
        status: "TERMINATED",
        terminatedOn,
      },
    })

    return result.count
  }

  async delete(organizationId: string, id: string, tx?: TxClient): Promise<number> {

    const result = await this.db(tx).employee.deleteMany({
      where: {
        id,
        organizationId,
      },
    })

    return result.count
  }
}

export { EmployeeRepository }
