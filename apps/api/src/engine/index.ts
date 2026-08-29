/**
 * The assignment engine.
 *
 * Pure functions over plain data: no Prisma, no Express, no I/O. Everything that
 * touches a database lives in `services/resolution.ts`, which loads the rows,
 * calls in here, and materializes the answer.
 */

export * from "./types"
export { evaluateConditions, explainFailure, explainMatch, renderClause } from "./conditions"
export { buildEmployeeContext, resolve } from "./resolve"
