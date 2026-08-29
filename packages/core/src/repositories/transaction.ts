import { PrismaClass } from "@policy/db"
import { TxClient } from "../interfaces/db"

/**
 * The transaction handle a service hands back to its repositories.
 *
 * Structurally this IS `TxClient` — the repositories keep taking the Prisma
 * transaction client they always took — but services see it under this name and
 * treat it as opaque: they receive one from `run`, pass it straight through to
 * repository calls, and never call a method on it. That is the whole point. The
 * service layer needs to state "these writes commit together", not "I have a
 * Prisma client".
 */
export type Tx = TxClient

/**
 * Owns the Prisma client on behalf of the service layer.
 *
 * Before this existed, every service held its own `PrismaClass.getInstance()`
 * purely so it could call `$transaction`, which put the one layer that is
 * supposed to be persistence-agnostic in direct contact with the ORM. The
 * transaction boundary is a data-layer concern, so the data layer owns it: this
 * is the only place outside a repository that knows Prisma exists, and services
 * reach it the same way they reach everything else — injected through the
 * constructor from `repositories/index.ts`.
 *
 * Swapping the persistence engine now means rewriting this file and the
 * repositories, and nothing in `services/`.
 */
class TransactionManager {

  private prisma = PrismaClass.getInstance()

  /**
   * Runs `work` inside a single database transaction.
   *
   * Everything the callback awaits with the supplied handle commits together or
   * not at all — the state change, its audit row, and any outbox row written
   * alongside it. Throwing from the callback rolls the whole thing back, so a
   * service signals failure exactly the way it always has.
   */
  async run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {

    return this.prisma.$transaction(async (tx) => {

      return work(tx)
    })
  }
}

export { TransactionManager }
