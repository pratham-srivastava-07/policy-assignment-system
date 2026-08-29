import { Prisma } from "@policy/db"

/**
 * The client handed to a repository method when it must run inside a caller's
 * transaction.
 *
 * This is what makes the transactional outbox work: a service opens one
 * transaction, passes `tx` to the repositories that write the state change AND
 * to the repository that writes the outbox row, so the job and the change commit
 * together or not at all.
 *
 * Every repository method that can participate in a transaction takes this as an
 * optional trailing argument and falls back to the singleton client.
 */
export type TxClient = Prisma.TransactionClient
