/**
 * `@policy/core` — everything that decides which policies apply to an employee,
 * with no opinion about how the question arrived.
 *
 * The API asks over HTTP and the reconciliation worker asks off a queue. Both
 * ask the same code: the data layer, the pure engine, and the materialization
 * that turns the engine's answer into rows. Nothing in here imports Express, and
 * nothing in here knows what a request is.
 *
 *     apps/api ---\
 *                  >--- @policy/core --- @policy/db, @policy/shared
 *     apps/worker -/
 *
 * The diff between desired and current assignments lives in exactly one place
 * (`services/resolution.ts`). That is the whole reason this package exists: two
 * implementations of that diff would drift, and a drifted diff is an employee
 * holding a policy nobody can explain.
 */

// The data layer: repository singletons, their record/filter types, and the
// transaction boundary.
export * from "./repositories"

// The pure engine: conditions, resolution, and its vocabulary.
export * from "./engine"

// Materialization.
export * from "./services/resolution"
export * from "./services/rule-fan-out"

// Persistence-shaped vocabulary. The HTTP-shaped halves of `employee` and
// `user` stay in apps/api and re-export from here.
export * from "./interfaces/db"
export * from "./interfaces/employee"
export * from "./interfaces/user"
export * from "./interfaces/resolution"

// Errors and row -> transport mappers.
export * from "./utils/AppError"
export * from "./utils/serialize"

/**
 * The structural error shape, exported under a distinct name.
 *
 * `interfaces/error.ts` declares an interface called `AppError` and
 * `utils/AppError.ts` declares a class called `AppError` that implements it.
 * Inside the package the two never met; at the package boundary they would be
 * one ambiguous name, so the interface is re-exported as `AppErrorShape`. The
 * class keeps the name every `throw` site already uses.
 */
export type { AppError as AppErrorShape } from "./interfaces/error"
