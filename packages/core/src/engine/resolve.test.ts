import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { resolve } from "./resolve"
import type { EngineEmployee, EngineRule } from "./types"

const day = (value: string): Date => new Date(`${value}T00:00:00.000Z`)

const employee: EngineEmployee = {
  id: "employee-1",
  department: "Engineering",
  state: "CA",
  country: "US",
  location: "San Francisco",
  employmentType: "FULL_TIME",
  role: "Engineer",
  isManager: false,
  hireDate: day("2020-01-01"),
  groupIds: [],
}

const rule = (overrides: Partial<EngineRule> = {}): EngineRule => ({
  id: "rule-default",
  version: 1,
  name: "Default rule",
  ruleType: "DEFAULT",
  priority: 100,
  conditions: { version: 1, all: [] },
  enabled: true,
  effectiveFrom: day("2020-01-01"),
  effectiveTo: null,
  createdAt: day("2025-01-01"),
  employeeId: null,
  policyId: "policy-default",
  policyName: "Default policy",
  policyStatus: "ACTIVE",
  categoryId: "category-1",
  categoryKey: "time_off",
  categoryName: "Time off",
  cardinality: "SINGLE",
  ...overrides,
})

describe("resolve", () => {
  test("selects exactly one winner in a SINGLE category and explains the loser", () => {
    const result = resolve({
      employee,
      asOf: day("2026-01-15"),
      rules: [
        rule({ id: "rule-low", name: "General", priority: 100 }),
        rule({
          id: "rule-high",
          name: "Engineering",
          policyId: "policy-engineering",
          policyName: "Engineering policy",
          ruleType: "DEPARTMENT",
          priority: 600,
        }),
      ],
    })

    assert.deepEqual(result.winners.map((winner) => winner.ruleId), ["rule-high"])
    assert.equal(result.trail.find((entry) => entry.ruleId === "rule-high")?.decision, "MATCHED_WON")
    assert.equal(result.trail.find((entry) => entry.ruleId === "rule-low")?.decision, "MATCHED_LOST")
    assert.match(
      result.trail.find((entry) => entry.ruleId === "rule-low")?.reason ?? "",
      /priority 600 beat 100/,
    )
  })

  test("breaks equal-priority ties by rule band, age, then id", async (t) => {
    await t.test("rule band", () => {
      const result = resolve({
        employee,
        asOf: day("2026-01-15"),
        rules: [
          rule({ id: "department", ruleType: "DEPARTMENT", priority: 500 }),
          rule({ id: "role", ruleType: "ROLE", priority: 500, policyId: "role-policy" }),
        ],
      })

      assert.equal(result.winners[0]?.ruleId, "role")
      assert.match(result.trail.find((entry) => entry.ruleId === "department")?.reason ?? "", /rule type decided/)
    })

    await t.test("older creation time", () => {
      const result = resolve({
        employee,
        asOf: day("2026-01-15"),
        rules: [
          rule({ id: "newer", createdAt: day("2025-02-01") }),
          rule({ id: "older", createdAt: day("2025-01-01"), policyId: "older-policy" }),
        ],
      })

      assert.equal(result.winners[0]?.ruleId, "older")
    })

    await t.test("lexicographic id", () => {
      const result = resolve({
        employee,
        asOf: day("2026-01-15"),
        rules: [
          rule({ id: "rule-b" }),
          rule({ id: "rule-a", policyId: "policy-a" }),
        ],
      })

      assert.equal(result.winners[0]?.ruleId, "rule-a")
    })
  })

  test("keeps independent policies in MULTIPLE categories and deduplicates one policy", () => {
    const result = resolve({
      employee,
      asOf: day("2026-01-15"),
      rules: [
        rule({
          id: "github-primary",
          categoryKey: "application_access",
          categoryName: "Application access",
          cardinality: "MULTIPLE",
          policyId: "github",
          policyName: "GitHub",
          priority: 600,
        }),
        rule({
          id: "github-duplicate",
          categoryKey: "application_access",
          categoryName: "Application access",
          cardinality: "MULTIPLE",
          policyId: "github",
          policyName: "GitHub",
          priority: 100,
        }),
        rule({
          id: "slack",
          categoryKey: "application_access",
          categoryName: "Application access",
          cardinality: "MULTIPLE",
          policyId: "slack",
          policyName: "Slack",
          priority: 400,
        }),
      ],
    })

    assert.deepEqual(
      result.winners.map((winner) => winner.policyId),
      ["github", "slack"],
    )
    assert.equal(
      result.trail.find((entry) => entry.ruleId === "github-duplicate")?.decision,
      "MATCHED_LOST",
    )
  })

  test("applies effective windows historically with an exclusive end date", () => {
    const historicalRule = rule({ effectiveTo: day("2026-01-15") })

    const beforeEnd = resolve({ employee, rules: [historicalRule], asOf: day("2026-01-14") })
    const onEnd = resolve({ employee, rules: [historicalRule], asOf: day("2026-01-15") })

    assert.equal(beforeEnd.winners.length, 1)
    assert.equal(onEnd.winners.length, 0)
    assert.equal(onEnd.trail[0]?.decision, "SKIPPED_OUT_OF_WINDOW")
  })

  test("records disabled, scheduled, and inactive-policy rules as explicit skips", () => {
    const result = resolve({
      employee,
      asOf: day("2026-01-15"),
      rules: [
        rule({ id: "disabled", enabled: false }),
        rule({ id: "scheduled", effectiveFrom: day("2026-01-16") }),
        rule({ id: "archived", policyStatus: "ARCHIVED" }),
      ],
    })

    assert.deepEqual(
      Object.fromEntries(result.trail.map((entry) => [entry.ruleId, entry.decision])),
      {
        disabled: "SKIPPED_DISABLED",
        scheduled: "SKIPPED_OUT_OF_WINDOW",
        archived: "SKIPPED_POLICY_INACTIVE",
      },
    )
  })
})
