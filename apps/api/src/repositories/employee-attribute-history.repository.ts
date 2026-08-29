import { EmployeeAttributeHistory, Prisma, PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"

/**
 * Effective-dated history of individual employee attributes.
 *
 * `employees` holds only the current value, so this table is what makes
 * "what was this employee's department on 1 January?" answerable — and therefore
 * what makes resolving assignments as of a past date possible at all.
 *
 * Writes always happen inside the same transaction as the employee update that
 * caused them.
 */
class EmployeeAttributeHistoryRepository {

  private prisma = PrismaClass.getInstance()

  private db(tx?: TxClient) {

    return tx ?? this.prisma
  }

  async createMany(
    rows: Prisma.EmployeeAttributeHistoryCreateManyInput[],
    tx?: TxClient,
  ): Promise<number> {

    if (rows.length === 0) {

      return 0
    }

    const result = await this.db(tx).employeeAttributeHistory.createMany({
      data: rows,
    })

    return result.count
  }

  /**
   * Close every currently-open row for the given attributes as of `effectiveTo`.
   *
   * Called immediately before inserting the replacement rows, so an attribute
   * has exactly one value in force on any given day.
   */
  async closeOpenRows(
    employeeId: string,
    attributes: string[],
    effectiveTo: Date,
    tx?: TxClient,
  ): Promise<number> {

    if (attributes.length === 0) {

      return 0
    }

    const result = await this.db(tx).employeeAttributeHistory.updateMany({
      where: {
        employeeId,
        attribute: {
          in: attributes,
        },
        effectiveTo: null,
      },
      data: {
        effectiveTo,
      },
    })

    return result.count
  }

  /** Full history for one employee, newest change first. */
  async findForEmployee(
    employeeId: string,
    tx?: TxClient,
  ): Promise<EmployeeAttributeHistory[]> {

    return this.db(tx).employeeAttributeHistory.findMany({
      where: {
        employeeId,
      },
      orderBy: [
        { effectiveFrom: "desc" },
        { createdAt: "desc" },
      ],
    })
  }

  /** The value of one attribute that was in force on `asOf`. */
  async findEffective(
    employeeId: string,
    attribute: string,
    asOf: Date,
    tx?: TxClient,
  ): Promise<EmployeeAttributeHistory | null> {

    return this.db(tx).employeeAttributeHistory.findFirst({
      where: {
        employeeId,
        attribute,
        effectiveFrom: {
          lte: asOf,
        },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gt: asOf } },
        ],
      },
      orderBy: {
        effectiveFrom: "desc",
      },
    })
  }
}

export { EmployeeAttributeHistoryRepository }
