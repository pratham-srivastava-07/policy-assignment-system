import { Employee, EmployeeStatus, Prisma, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"
import {
  CreateEmployeeRecord,
  EmployeeListOptions,
  UpdateEmployeeRecord,
} from "../interfaces/employee"
import { CandidateFilter } from "../engine/candidates"

/**
 * How far the recursive subtree walk is allowed to descend.
 *
 * This is a safety belt, not a business rule. A well-formed org chart is a tree
 * and never comes close to it; the cap exists so that a cycle that somehow got
 * past the service check (a direct UPDATE against the database, say) costs a
 * bounded query instead of hanging the connection. The visited-set in the CTE
 * already breaks such a cycle — the cap is the second, cheaper guarantee.
 */
const MAX_ORG_CHART_DEPTH = 64

/** A single-column result row from the subtree CTE. */
interface SubtreeIdRow {
  id: string
}

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

    // The subtree narrowing a MANAGER's collection read is confined to. It is an
    // additional AND, never a replacement for the tenant predicate, and an empty
    // list is honoured as "no rows" rather than quietly ignored.
    if (options.employeeIds !== undefined) where.id = { in: options.employeeIds }

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

  // -------------------------------------------------------------------------
  // Org chart
  //
  // The reporting structure is `employees.manager_id`, a single self-referencing
  // edge. Everything below reads it; nothing below writes it except
  // `setIsManager`, which maintains the derived flag rather than the edge.
  // -------------------------------------------------------------------------

  /**
   * The employees who report directly to this one.
   *
   * ACTIVE only. A terminated report is not somebody you manage, and counting
   * one would keep `is_manager` true for a manager whose whole team has left.
   */
  async findDirectReports(
    organizationId: string,
    managerId: string,
    tx?: TxClient,
  ): Promise<Employee[]> {

    return this.db(tx).employee.findMany({
      where: {
        organizationId,
        managerId,
        status: "ACTIVE",
      },
      orderBy: {
        name: "asc",
      },
    })
  }

  /**
   * How many ACTIVE employees report directly to this one.
   *
   * This is the authority behind `is_manager`: the flag is exactly
   * `countDirectReports(...) > 0`, recomputed by the service inside the same
   * transaction as the `manager_id` change that could have moved it.
   */
  async countDirectReports(
    organizationId: string,
    managerId: string,
    tx?: TxClient,
  ): Promise<number> {

    return this.db(tx).employee.count({
      where: {
        organizationId,
        managerId,
        status: "ACTIVE",
      },
    })
  }

  /**
   * The root employee plus every employee beneath them in the org chart.
   *
   * A reporting chain is unbounded in depth, so this is a recursive CTE rather
   * than a fixed number of joins. Two properties matter:
   *
   *   * It is CYCLE-SAFE. `path` accumulates every id already visited on this
   *     branch and the recursive term refuses to re-enter one
   *     (`NOT (c.id = ANY(s.path))`), so a cycle terminates the branch instead
   *     of looping. `depth < MAX_ORG_CHART_DEPTH` is a second, independent stop.
   *     Neither is load-bearing for a well-formed chart — they exist so that a
   *     malformed one cannot hang the query, which is the failure mode that
   *     takes a connection pool with it.
   *
   *   * It is TENANT-SAFE. `organization_id` is constrained inside BOTH the
   *     anchor and the recursive term, not only at the root. Constraining only
   *     the root would let the walk cross into another tenant's rows the moment
   *     one bad `manager_id` pointed there.
   *
   * The root is included in the result: a manager's own record is inside their
   * own scope.
   */
  async findSubtreeIds(
    organizationId: string,
    rootEmployeeId: string,
    tx?: TxClient,
  ): Promise<string[]> {

    const rows = await this.db(tx).$queryRaw<SubtreeIdRow[]>`
      WITH RECURSIVE subtree AS (
        SELECT
          root.id,
          ARRAY[root.id] AS path,
          1 AS depth
        FROM employees root
        WHERE root.organization_id = ${organizationId}::uuid
          AND root.id = ${rootEmployeeId}::uuid

        UNION ALL

        SELECT
          child.id,
          parent.path || child.id,
          parent.depth + 1
        FROM employees child
        JOIN subtree parent ON child.manager_id = parent.id
        WHERE child.organization_id = ${organizationId}::uuid
          AND parent.depth < ${MAX_ORG_CHART_DEPTH}
          AND NOT (child.id = ANY(parent.path))
      )
      SELECT DISTINCT id FROM subtree
    `

    return rows.map((row) => row.id)
  }

  /**
   * Whether `candidateId` sits anywhere in `rootEmployeeId`'s subtree.
   *
   * The same walk as `findSubtreeIds`, with the same cycle and tenant guards,
   * but it stops at the first hit and never materializes the id list. This is
   * the check that makes a reporting cycle impossible: "may X report to Y?"
   * is "is Y already below X?".
   *
   * The root answers for itself without touching the database — an employee is
   * trivially inside their own subtree.
   */
  async isInSubtree(
    organizationId: string,
    rootEmployeeId: string,
    candidateId: string,
    tx?: TxClient,
  ): Promise<boolean> {

    if (rootEmployeeId === candidateId) {

      return true
    }

    const rows = await this.db(tx).$queryRaw<SubtreeIdRow[]>`
      WITH RECURSIVE subtree AS (
        SELECT
          root.id,
          ARRAY[root.id] AS path,
          1 AS depth
        FROM employees root
        WHERE root.organization_id = ${organizationId}::uuid
          AND root.id = ${rootEmployeeId}::uuid

        UNION ALL

        SELECT
          child.id,
          parent.path || child.id,
          parent.depth + 1
        FROM employees child
        JOIN subtree parent ON child.manager_id = parent.id
        WHERE child.organization_id = ${organizationId}::uuid
          AND parent.depth < ${MAX_ORG_CHART_DEPTH}
          AND NOT (child.id = ANY(parent.path))
      )
      SELECT id FROM subtree WHERE id = ${candidateId}::uuid LIMIT 1
    `

    return rows.length > 0
  }

  /**
   * Sets the derived `is_manager` flag.
   *
   * Separate from `update` on purpose: this is not an authored attribute, and
   * the only correct caller is the service recomputing it from
   * `countDirectReports` in the same transaction as a `manager_id` change.
   */
  async setIsManager(
    organizationId: string,
    employeeId: string,
    value: boolean,
    tx?: TxClient,
  ): Promise<number> {

    const result = await this.db(tx).employee.updateMany({
      where: {
        id: employeeId,
        organizationId,
      },
      data: {
        isManager: value,
      },
    })

    return result.count
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
