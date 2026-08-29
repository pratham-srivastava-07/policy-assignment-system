/**
 * The persistence-shaped half of the user vocabulary.
 *
 * The service and controller interfaces stay in `apps/api`, which re-exports
 * these two. A password only ever reaches a repository already hashed, which is
 * why there is no plaintext field anywhere below.
 */

/** What a repository write actually persists — never the plaintext password. */
export interface CreateUserRecord {
  name: string
  email: string
  passwordHash: string
  employeeId?: string | null
}

export interface UpdateUserRecord {
  name?: string
  email?: string
  passwordHash?: string
  employeeId?: string | null
}
