import { Employee, Prisma, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"
import {
  CreateEmployeeRecord,
  EmployeeListOptions,
  UpdateEmployeeRecord,
} from "../interfaces/employee"

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
