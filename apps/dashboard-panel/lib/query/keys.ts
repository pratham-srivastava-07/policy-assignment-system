import type { AsOf } from "@/lib/dates"

/**
 * design.md §35.1.
 *
 * Two rules hold across every phase:
 *
 *  1. A key for a read that accepts `asOf` (§8.2) carries it, so historical and
 *     current views cache independently.
 *  2. A single entity's keys are prefixed by `[entity, id]`, so a write can
 *     invalidate everything beneath one record without touching its siblings.
 */

export type ListParams = Record<string, unknown>

export const queryKeys = {
  session: () => ["session", "me"] as const,

  employees: (params: ListParams) => ["employees", params] as const,
  employee: (id: string) => ["employee", id] as const,
  employeeAssignments: (id: string, asOf: AsOf) =>
    ["employee", id, "assignments", asOf] as const,
  employeeGroups: (id: string, asOf: AsOf) => ["employee", id, "groups", asOf] as const,
  employeeAttributeHistory: (id: string) => ["employee", id, "attribute-history"] as const,
  employeeOverrides: (id: string) => ["employee", id, "overrides"] as const,
  employeeAudit: (id: string, params: ListParams) =>
    ["employee", id, "audit", params] as const,
  employeePreview: (id: string, asOf: AsOf, input: unknown) =>
    ["employee", id, "preview", asOf, input] as const,

  assignments: (employeeIds: readonly string[], asOf: AsOf) =>
    ["assignments", employeeIds, asOf] as const,
  assignmentExplanation: (id: string) => ["assignment", id, "explanation"] as const,

  rules: (params: ListParams) => ["rules", params] as const,
  rule: (id: string) => ["rule", id] as const,
  ruleVersions: (id: string) => ["rule", id, "versions"] as const,
  ruleMatchingEmployees: (id: string, asOf: AsOf, params: ListParams) =>
    ["rule", id, "matching-employees", asOf, params] as const,
  ruleSimulation: (input: unknown, asOf: AsOf) =>
    ["rules", "simulate", input, asOf] as const,

  policies: (params: ListParams) => ["policies", params] as const,
  policy: (id: string) => ["policy", id] as const,
  policyAssignments: (id: string, asOf: AsOf, page: number) =>
    ["policy", id, "assignments", asOf, page] as const,

  policyCategories: () => ["policy-categories"] as const,
  policyCategory: (id: string) => ["policy-category", id] as const,

  groups: (params: ListParams) => ["groups", params] as const,
  group: (id: string) => ["group", id] as const,
  groupMembers: (id: string, asOf: AsOf) => ["group", id, "members", asOf] as const,

  access: (asOf: AsOf, params: ListParams) => ["access", asOf, params] as const,

  auditEvents: (params: ListParams) => ["audit-events", params] as const,

  reconciliationStatus: () => ["reconciliation", "status"] as const,
  reconciliationEvents: (params: ListParams) =>
    ["reconciliation", "events", params] as const,

  users: (params: ListParams) => ["users", params] as const,
  user: (id: string) => ["user", id] as const,
} as const
