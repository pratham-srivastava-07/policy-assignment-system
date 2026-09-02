/**
 * design.md §8.2. The endpoints that reject an unknown query key are `.strict()`
 * on the server, so sending `asOf` to one in NON_ASOF_ENDPOINTS is a 400, not a
 * silently ignored parameter.
 *
 * Paths are the request paths the API client is given, with `:id` for a segment.
 */

export const ASOF_ENDPOINTS = [
  "/employees/:id/assignments",
  "/employees/:id/groups",
  "/employees/:id/preview",
  "/policies/:id/assignments",
  "/groups/:id/members",
  "/rules/:id/matching-employees",
  "/rules/simulate",
  "/assignments",
  "/access",
  "/reconciliation/employees/:id",
] as const

export type AsOfEndpoint = (typeof ASOF_ENDPOINTS)[number]

export const NON_ASOF_ENDPOINTS = [
  "/employees",
  "/employees/:id",
  "/rules",
  "/policies",
  "/groups",
  "/audit-events",
  "/reconciliation/status",
  "/reconciliation/events",
] as const

const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const toPattern = (path: string) =>
  path
    .split("?")[0]!
    .split("/")
    .map((segment) => (UUID_SEGMENT.test(segment) ? ":id" : segment))
    .join("/")

export const endpointHonoursAsOf = (path: string): boolean =>
  (ASOF_ENDPOINTS as readonly string[]).includes(toPattern(path))
