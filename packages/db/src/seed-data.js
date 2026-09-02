"use strict"

/**
 * Demo seed script.
 *
 * Builds one realistic organization ("Northwind Dynamics") entirely through the
 * live HTTP API, so every employee/rule/group write goes through the real
 * services (attribute history, isManager derivation, rule versioning, outbox
 * enqueueing) instead of being hand-inserted. Every assignment and resolution
 * trail is produced by calling the real reconciliation endpoint, which runs
 * `ResolutionService.reconcile` — the same code path production traffic uses.
 *
 * Idempotent by detection: if the seed admin can already log in, the org exists
 * and the script exits without touching anything.
 */

const BASE_URL = process.env.SEED_API_BASE_URL || "http://localhost:3000/api/v1"

const ORG_NAME = "Northwind Dynamics"

const ADMIN = { name: "Jordan Blake", email: "admin@northwind.dev", password: "Northwind#2026Admin" }
const HR_ADMIN = { name: "Priya Anand", email: "hr@northwind.dev", password: "Northwind#2026HR" }
const MANAGER_USER = { name: "", email: "manager@northwind.dev", password: "Northwind#2026Mgr" }
const EMPLOYEE_USER = { name: "", email: "employee@northwind.dev", password: "Northwind#2026Emp" }

// ---------------------------------------------------------------------------
// HTTP client with tier-aware retry on 429
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function request(method, path, { token, body } = {}) {

  for (let attempt = 0; attempt < 30; attempt++) {

    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (res.status === 429) {

      const retryAfter = Number(res.headers.get("retry-after") ?? "2")

      await sleep((retryAfter + 0.25) * 1000)

      continue
    }

    const text = await res.text()
    const json = text ? JSON.parse(text) : null

    if (!res.ok) {

      const err = new Error(`${method} ${path} -> ${res.status}: ${json?.message ?? text}`)

      err.status = res.status
      err.code = json?.code
      err.body = json

      throw err
    }

    return json?.data
  }

  throw new Error(`${method} ${path} kept hitting 429 after 30 attempts`)
}

const get = (path, token) => request("GET", path, { token })
const post = (path, token, body) => request("POST", path, { token, body: body ?? {} })
const patch = (path, token, body) => request("PATCH", path, { token, body: body ?? {} })
const del = (path, token, body) => request("DELETE", path, { token, body })

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness, so reruns against a fresh DB are stable
// ---------------------------------------------------------------------------

function mulberry32(seed) {

  let a = seed

  return function next() {

    a |= 0
    a = (a + 0x6d2b79f5) | 0

    let t = Math.imul(a ^ (a >>> 15), 1 | a)

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260902)

const randInt = (min, max) => min + Math.floor(rand() * (max - min + 1))

const pick = (arr, index) => arr[index % arr.length]

// ---------------------------------------------------------------------------
// Calendar helpers
// ---------------------------------------------------------------------------

const TODAY = new Date()

function isoDaysAgo(days) {

  const d = new Date(TODAY.getTime() - days * 86400000)

  return d.toISOString().slice(0, 10)
}

const TENURE_THRESHOLD_DAYS = 1825 // 5 years, matches the Executive Vacation rule

// ---------------------------------------------------------------------------
// Roster generation
// ---------------------------------------------------------------------------

const DEPARTMENTS = ["Engineering", "Sales", "Marketing", "Finance", "People", "Support"]

const ROLE_POOL = {
  Engineering: {
    vp: "VP of Engineering",
    manager: "Engineering Manager",
    ic: ["Software Engineer", "Senior Software Engineer", "Staff Engineer", "QA Engineer"],
  },
  Sales: {
    vp: "VP of Sales",
    manager: "Sales Manager",
    ic: ["Account Executive", "Sales Development Rep", "Sales Engineer"],
  },
  Marketing: {
    vp: "VP of Marketing",
    manager: "Marketing Manager",
    ic: ["Marketing Specialist", "Content Strategist", "Growth Marketer"],
  },
  Finance: {
    vp: "VP of Finance",
    manager: "Finance Manager",
    ic: ["Financial Analyst", "Accountant", "Payroll Specialist"],
  },
  People: {
    vp: "VP of People",
    manager: "People Manager",
    ic: ["HR Coordinator", "People Partner", "Recruiter"],
  },
  Support: {
    vp: "VP of Support",
    manager: "Support Manager",
    ic: ["Support Specialist", "Technical Support Engineer"],
  },
}

const MANAGER_COUNTS = { Engineering: 4, Sales: 3, Marketing: 2, Finance: 2, People: 2, Support: 2 }
const IC_COUNTS = { Engineering: 35, Sales: 20, Marketing: 12, Finance: 12, People: 10, Support: 9 }

const STATE_CYCLE = ["CA", "NY", "TX", "WA", "MA"]

const STATE_LOCATION = {
  CA: "San Francisco, CA",
  NY: "New York, NY",
  TX: "Austin, TX",
  WA: "Seattle, WA",
  MA: "Boston, MA",
}

const FIRST_NAMES = [
  "Alice", "Maya", "Raj", "Liam", "Sofia", "Noah", "Emma", "Ethan", "Zoe", "Lucas",
  "Aria", "Mason", "Chloe", "Elijah", "Grace", "Oliver", "Ivy", "James", "Nora", "Ben",
  "Priya", "Marcus", "Elena", "Diego", "Hana", "Felix", "Nina", "Tariq", "Ruth", "Owen",
  "Kai", "Layla", "Victor", "Amara", "Theo", "Simone", "Arjun", "Freya", "Malik", "Isla",
]

const LAST_NAMES = [
  "Chen", "Singh", "Patel", "Nguyen", "Garcia", "Kim", "Silva", "Rossi", "Novak", "Adeyemi",
  "Fischer", "Morales", "Kowalski", "Haddad", "Ibrahim", "Larsen", "Petrov", "Okafor", "Tanaka", "Reyes",
  "Bennett", "Sullivan", "Warren", "Bishop", "Fontaine", "Marsh", "Whitfield", "Doyle", "Sato", "Kaur",
]

function nameFor(globalIndex) {

  const first = pick(FIRST_NAMES, globalIndex)
  const last = pick(LAST_NAMES, globalIndex * 7 + 3)

  return `${first} ${last}`
}

function emailFor(name, globalIndex) {

  const slug = name.toLowerCase().replace(/[^a-z]+/g, ".")

  return `${slug}.${globalIndex}@northwind.dev`
}

/**
 * Builds the full 120-person roster as plain descriptors keyed by a local
 * string id. `managerKey` points at another descriptor's `key`, and the roster
 * is emitted in topological order (CEO, VPs, managers, ICs) so creation can walk
 * it top-down.
 */
function buildRoster() {

  const roster = []
  let globalIndex = 0

  const addPerson = (fields) => {

    const idx = globalIndex++
    const name = nameFor(idx)

    const person = {
      globalIndex: idx,
      name,
      email: emailFor(name, idx),
      employmentType: "FULL_TIME",
      country: "US",
      ...fields,
    }

    if (person.state && !person.location) {

      person.location = STATE_LOCATION[person.state] ?? person.state
    }

    roster.push(person)

    return person
  }

  const ceo = addPerson({
    key: "ceo",
    role: "Chief Executive Officer",
    department: null,
    state: "CA",
    location: "San Francisco, CA",
    managerKey: null,
    tenureDays: 2950,
  })

  const managersByDept = {}
  const icsByDept = {}

  for (const dept of DEPARTMENTS) {

    const vp = addPerson({
      key: `${dept}-vp`,
      role: ROLE_POOL[dept].vp,
      department: dept,
      state: pick(STATE_CYCLE, globalIndex),
      managerKey: ceo.key,
      tenureDays: randInt(1950, 2650),
    })

    managersByDept[dept] = []

    for (let m = 0; m < MANAGER_COUNTS[dept]; m++) {

      const manager = addPerson({
        key: `${dept}-mgr-${m}`,
        role: ROLE_POOL[dept].manager,
        department: dept,
        state: pick(STATE_CYCLE, globalIndex),
        managerKey: vp.key,
        tenureDays: randInt(800, 2100),
      })

      managersByDept[dept].push(manager)
    }

    icsByDept[dept] = []

    for (let i = 0; i < IC_COUNTS[dept]; i++) {

      const manager = pick(managersByDept[dept], i)

      const ic = addPerson({
        key: `${dept}-ic-${i}`,
        role: pick(ROLE_POOL[dept].ic, i),
        department: dept,
        state: pick(STATE_CYCLE, globalIndex),
        managerKey: manager.key,
        tenureDays: randInt(30, 1600),
        icDeptIndex: i,
      })

      icsByDept[dept].push(ic)
    }
  }

  return { roster, ceo, managersByDept, icsByDept }
}

const { roster, managersByDept, icsByDept } = buildRoster()

const vps = roster.filter((p) => p.key.endsWith("-vp"))
const allManagers = Object.values(managersByDept).flat()

const byKey = new Map(roster.map((p) => [p.key, p]))

const financeContractor = icsByDept.Finance[0]
const financeFullTimeLoser = icsByDept.Finance[1]
const overrideWinEmployee = icsByDept.Marketing[0]
const overrideAccessEmployee = icsByDept.Sales[0]

const reservedKeys = new Set(
  [financeContractor, financeFullTimeLoser, overrideWinEmployee, overrideAccessEmployee].map(
    (p) => p.key,
  ),
)

const terminatedEmployees = [icsByDept.Support[7], icsByDept.Support[8]]

for (const p of terminatedEmployees) {

  reservedKeys.add(p.key)
}

const allIcs = roster.filter((p) => p.key.includes("-ic-"))

const inBulkRemainder = (p, remainders, mod) =>
  !reservedKeys.has(p.key) && remainders.includes(p.globalIndex % mod)

const tenureNearMiss = allIcs.filter((p) => inBulkRemainder(p, [0], 20))
const tenureWinnerBoost = allIcs.filter((p) => inBulkRemainder(p, [1], 20))
const nullDeptPool = allIcs.filter((p) => inBulkRemainder(p, [2], 20))
const nullStateRemotePool = allIcs.filter((p) => inBulkRemainder(p, [3], 20))
const countryCAPool = allIcs.filter((p) => inBulkRemainder(p, [4], 20))
const countryUKPool = allIcs.filter((p) => inBulkRemainder(p, [5], 20))
const contractorPool = allIcs.filter((p) => inBulkRemainder(p, [6, 7, 8], 20))
const partTimePool = allIcs.filter((p) => inBulkRemainder(p, [9, 10], 20))
const backdatePoolIcs = allIcs.filter((p) => inBulkRemainder(p, [11, 12, 13, 14], 20)).slice(0, 8)

// Apply the attribute mutations to the roster in place.

for (const p of tenureNearMiss) p.tenureDays = randInt(1750, TENURE_THRESHOLD_DAYS - 1)
for (const p of tenureWinnerBoost) p.tenureDays = randInt(TENURE_THRESHOLD_DAYS, 2400)

for (const p of nullDeptPool) p.department = null

for (const p of nullStateRemotePool) {

  p.state = null
  p.location = "Remote"
}

for (const p of countryCAPool) {

  p.country = "CA"
  p.state = null
  p.location = "Toronto, ON"
}

for (const p of countryUKPool) {

  p.country = "UK"
  p.state = null
  p.location = "London, UK"
}

for (const p of contractorPool) p.employmentType = "CONTRACTOR"
for (const p of partTimePool) p.employmentType = "PART_TIME"

financeContractor.employmentType = "CONTRACTOR"
financeFullTimeLoser.employmentType = "FULL_TIME"
overrideWinEmployee.tenureDays = randInt(600, 1200) // clearly under the tenure threshold

const backdateManagers = [
  managersByDept.Engineering[0],
  managersByDept.Sales[0],
  managersByDept.Marketing[0],
  managersByDept.Finance[0],
]

const backdateEmployees = [...backdatePoolIcs, ...backdateManagers]

// Group membership pools. Selections deliberately overlap across pools (an
// employee can be in both the 401k group and the beta group) — that overlap is
// what "overlapping membership" in the seed brief means.
const k401Members = allIcs.filter((p) => p.globalIndex % 4 === 0)
const betaMembers = allIcs.filter((p) => p.globalIndex % 9 === 3)
const remoteMembers = nullStateRemotePool
const leadershipMembers = [...vps, ...allManagers]
const allHandsMembers = [vps.find((p) => p.department === "Engineering"), ...managersByDept.Engineering]
const legacyPilotMembers = [icsByDept.People[0], icsByDept.People[1]]
const endedMembershipEmployee = icsByDept.Support[0]

const managerUserEmployee = managersByDept.Engineering[0]
const employeeUserEmployee = icsByDept.Support[1]

// ---------------------------------------------------------------------------
// Policy categories, policies, groups, rules
// ---------------------------------------------------------------------------

const CATEGORIES = [
  { key: "pay_schedule", name: "Pay Schedule", cardinality: "SINGLE" },
  { key: "time_off", name: "Time Off", cardinality: "SINGLE" },
  { key: "compliance", name: "Compliance", cardinality: "MULTIPLE" },
  { key: "benefits", name: "Benefits", cardinality: "MULTIPLE" },
  { key: "application_access", name: "Application Access", cardinality: "MULTIPLE" },
]

const POLICIES = [
  { key: "weekly_pay", category: "pay_schedule", name: "Weekly Pay", status: "ACTIVE" },
  { key: "biweekly_pay", category: "pay_schedule", name: "Bi-Weekly Pay", status: "ACTIVE" },
  { key: "monthly_pay", category: "pay_schedule", name: "Monthly Pay", status: "ACTIVE" },

  { key: "standard_vacation", category: "time_off", name: "Standard Vacation", status: "ACTIVE" },
  { key: "executive_vacation", category: "time_off", name: "Executive Vacation", status: "ACTIVE" },
  { key: "parttime_pto", category: "time_off", name: "Part-Time PTO", status: "ACTIVE" },

  { key: "harassment_training", category: "compliance", name: "Harassment Training", status: "ACTIVE" },
  { key: "ca_meal_break", category: "compliance", name: "CA Meal Break Training", status: "ACTIVE" },
  { key: "manager_leadership", category: "compliance", name: "Manager Leadership Training", status: "ACTIVE" },
  { key: "security_2027", category: "compliance", name: "Security Training 2027", status: "DRAFT" },

  { key: "healthcare", category: "benefits", name: "Healthcare Plan", status: "ACTIVE" },
  { key: "retirement_401k", category: "benefits", name: "Retirement 401k", status: "ACTIVE" },
  { key: "legacy_gym", category: "benefits", name: "Legacy Gym Stipend", status: "ARCHIVED" },

  { key: "github", category: "application_access", name: "GitHub", status: "ACTIVE" },
  { key: "slack", category: "application_access", name: "Slack", status: "ACTIVE" },
  { key: "jira", category: "application_access", name: "Jira", status: "ACTIVE" },
]

const GROUPS = [
  { key: "k401", name: "401k Eligible", description: "Employees enrolled in the 401k program." },
  { key: "beta", name: "Beta Testers", description: "Early access to internal tools, including GitHub." },
  { key: "remote", name: "Remote Employees", description: "Employees without a fixed office location." },
  { key: "leadership", name: "Leadership Circle", description: "Everyone with at least one direct report." },
  { key: "allhands", name: "Engineering All-Hands", description: "Every member of the Engineering org." },
  { key: "legacy_pilot", name: "Legacy Pilot Group", description: "A 2025 pilot cohort, since retired." },
]

const condition = (attribute, op, value) => ({ attribute, op, value })
const conditions = (...all) => ({ version: 1, all })
const noConditions = conditions()

module.exports = {
  BASE_URL,
  ORG_NAME,
  ADMIN,
  HR_ADMIN,
  MANAGER_USER,
  EMPLOYEE_USER,
  get,
  post,
  patch,
  del,
  isoDaysAgo,
  TENURE_THRESHOLD_DAYS,
  roster,
  byKey,
  vps,
  allManagers,
  managersByDept,
  icsByDept,
  financeContractor,
  financeFullTimeLoser,
  overrideWinEmployee,
  overrideAccessEmployee,
  terminatedEmployees,
  backdateEmployees,
  k401Members,
  betaMembers,
  remoteMembers,
  leadershipMembers,
  allHandsMembers,
  legacyPilotMembers,
  endedMembershipEmployee,
  managerUserEmployee,
  employeeUserEmployee,
  CATEGORIES,
  POLICIES,
  GROUPS,
  condition,
  conditions,
  noConditions,
}
