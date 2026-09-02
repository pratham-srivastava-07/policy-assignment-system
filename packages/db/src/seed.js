"use strict"

const data = require("./seed-data")

const {
  ORG_NAME,
  ADMIN,
  HR_ADMIN,
  MANAGER_USER,
  EMPLOYEE_USER,
  post,
  patch,
  del,
  isoDaysAgo,
  roster,
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
} = data

let completed = 0

function progress(label) {

  completed += 1

  if (completed % 15 === 0) {

    console.log(`  ... ${completed} operations done (${label})`)
  }
}

/**
 * The 20 automatic rules. `policy` and, where relevant, `group` are resolved
 * to real ids by the caller — everything here is otherwise exactly the request
 * body `POST /rules` expects.
 */
function buildRuleDefs(policyId, groupId) {

  return [
    // --- Pay Schedule (SINGLE) ---------------------------------------------
    {
      name: "Bi-Weekly Pay - Standard",
      policyId: policyId("biweekly_pay"),
      ruleType: "DEFAULT",
      conditions: noConditions,
      effectiveFrom: isoDaysAgo(2600),
    },
    {
      name: "Finance Weekly Pay",
      policyId: policyId("weekly_pay"),
      ruleType: "DEPARTMENT",
      conditions: conditions(condition("department", "eq", "Finance")),
      effectiveFrom: isoDaysAgo(2000),
    },
    {
      name: "Contractor Monthly Pay",
      policyId: policyId("monthly_pay"),
      ruleType: "ROLE",
      conditions: conditions(condition("employmentType", "eq", "CONTRACTOR")),
      effectiveFrom: isoDaysAgo(2000),
    },
    {
      name: "Legacy Support Weekly Pay (disabled)",
      policyId: policyId("weekly_pay"),
      ruleType: "DEPARTMENT",
      conditions: conditions(condition("department", "eq", "Support")),
      enabled: false,
      effectiveFrom: isoDaysAgo(2200),
    },
    {
      name: "Marketing Monthly Bonus Rollout",
      policyId: policyId("monthly_pay"),
      ruleType: "DEPARTMENT",
      conditions: conditions(condition("department", "eq", "Marketing")),
      effectiveFrom: isoDaysAgo(-120),
    },

    // --- Time Off (SINGLE) --------------------------------------------------
    {
      name: "Standard Vacation - Everyone",
      policyId: policyId("standard_vacation"),
      ruleType: "DEFAULT",
      conditions: noConditions,
      effectiveFrom: isoDaysAgo(2600),
    },
    {
      name: "Executive Vacation - 5 Year Tenure",
      policyId: policyId("executive_vacation"),
      ruleType: "TENURE",
      conditions: conditions(condition("tenureDays", "gte", 1825)),
      effectiveFrom: isoDaysAgo(2600),
    },
    {
      name: "Part-Time PTO",
      policyId: policyId("parttime_pto"),
      ruleType: "ROLE",
      conditions: conditions(condition("employmentType", "eq", "PART_TIME")),
      effectiveFrom: isoDaysAgo(2000),
    },

    // --- Compliance (MULTIPLE) ----------------------------------------------
    {
      name: "Harassment Training - Everyone",
      policyId: policyId("harassment_training"),
      ruleType: "DEFAULT",
      conditions: noConditions,
      effectiveFrom: isoDaysAgo(2600),
    },
    {
      name: "Manager Leadership Training",
      policyId: policyId("manager_leadership"),
      ruleType: "ROLE",
      conditions: conditions(condition("isManager", "eq", true)),
      effectiveFrom: isoDaysAgo(2000),
    },
    {
      name: "CA Meal Break Training",
      policyId: policyId("ca_meal_break"),
      ruleType: "LOCATION",
      conditions: conditions(condition("state", "eq", "CA")),
      effectiveFrom: isoDaysAgo(2000),
    },
    {
      name: "Security Training 2027 Rollout",
      policyId: policyId("security_2027"),
      ruleType: "DEPARTMENT",
      conditions: conditions(condition("department", "eq", "Engineering")),
      effectiveFrom: isoDaysAgo(30),
    },
    {
      name: "2023 Interim Safety Training (expired)",
      policyId: policyId("ca_meal_break"),
      ruleType: "LOCATION",
      conditions: conditions(condition("state", "eq", "CA")),
      effectiveFrom: isoDaysAgo(1400),
      effectiveTo: isoDaysAgo(1000),
    },

    // --- Benefits (MULTIPLE) -------------------------------------------------
    {
      name: "Healthcare Plan - Full-Time",
      policyId: policyId("healthcare"),
      ruleType: "ROLE",
      conditions: conditions(condition("employmentType", "eq", "FULL_TIME")),
      effectiveFrom: isoDaysAgo(2600),
    },
    {
      name: "Retirement 401k - Eligible Group",
      policyId: policyId("retirement_401k"),
      ruleType: "GROUP",
      conditions: conditions(condition("groupId", "eq", groupId("k401"))),
      effectiveFrom: isoDaysAgo(1500),
    },
    {
      name: "Legacy Gym Stipend - Grandfathered Engineering",
      policyId: policyId("legacy_gym"),
      ruleType: "DEPARTMENT",
      conditions: conditions(condition("department", "eq", "Engineering")),
      effectiveFrom: isoDaysAgo(2000),
    },

    // --- Application Access (MULTIPLE) ---------------------------------------
    {
      name: "GitHub - Engineering",
      policyId: policyId("github"),
      ruleType: "DEPARTMENT",
      conditions: conditions(condition("department", "eq", "Engineering")),
      effectiveFrom: isoDaysAgo(2000),
    },
    {
      name: "Slack - Everyone",
      policyId: policyId("slack"),
      ruleType: "DEFAULT",
      conditions: noConditions,
      effectiveFrom: isoDaysAgo(2600),
    },
    {
      name: "Jira - Engineering",
      policyId: policyId("jira"),
      ruleType: "DEPARTMENT",
      conditions: conditions(condition("department", "eq", "Engineering")),
      effectiveFrom: isoDaysAgo(2000),
    },
    {
      name: "GitHub - Beta Testers Group",
      policyId: policyId("github"),
      ruleType: "GROUP",
      conditions: conditions(condition("groupId", "eq", groupId("beta"))),
      effectiveFrom: isoDaysAgo(1200),
    },
  ]
}

async function alreadySeeded() {

  try {

    await post("/auth/login", null, { email: ADMIN.email, password: ADMIN.password })

    return true
  } catch (err) {

    if (err.status === 401) {

      return false
    }

    throw err
  }
}

async function addMembers(groupId, token, members, effectiveFrom) {

  for (const member of members) {

    if (!member) continue

    await post(`/groups/${groupId}/members`, token, {
      employeeId: member.id,
      effectiveFrom,
    })

    progress("group member")
  }
}

async function main() {

  console.log(`Seeding "${ORG_NAME}" against ${data.BASE_URL} ...`)

  if (await alreadySeeded()) {

    console.log("Demo org already seeded (admin login succeeded) - skipping.")
    printCredentials()

    return
  }

  console.log("Creating organization and admin ...")

  const signup = await post("/auth/signup", null, {
    name: ADMIN.name,
    email: ADMIN.email,
    password: ADMIN.password,
    organizationName: ORG_NAME,
  })

  const adminToken = signup.token

  // -------------------------------------------------------------------------
  // Policy categories
  // -------------------------------------------------------------------------

  console.log("Creating policy categories ...")

  const categoryIdByKey = new Map()

  for (const cat of CATEGORIES) {

    const created = await post("/policy-categories", adminToken, {
      name: cat.name,
      key: cat.key,
      cardinality: cat.cardinality,
    })

    categoryIdByKey.set(cat.key, created.id)
    progress("category")
  }

  // -------------------------------------------------------------------------
  // Policies
  // -------------------------------------------------------------------------

  console.log("Creating policies ...")

  const policyIdByKey = new Map()

  for (const pol of POLICIES) {

    const created = await post("/policies", adminToken, {
      categoryId: categoryIdByKey.get(pol.category),
      name: pol.name,
      status: pol.status,
    })

    policyIdByKey.set(pol.key, created.id)
    progress("policy")
  }

  const policyId = (key) => policyIdByKey.get(key)

  // -------------------------------------------------------------------------
  // Groups
  // -------------------------------------------------------------------------

  console.log("Creating groups ...")

  const groupIdByKey = new Map()

  for (const grp of GROUPS) {

    const created = await post("/groups", adminToken, {
      name: grp.name,
      description: grp.description,
    })

    groupIdByKey.set(grp.key, created.id)
    progress("group")
  }

  const groupId = (key) => groupIdByKey.get(key)

  // -------------------------------------------------------------------------
  // Employees (topological order: CEO, VPs, managers, ICs)
  // -------------------------------------------------------------------------

  console.log(`Creating ${roster.length} employees ...`)

  const employeeIdByKey = new Map()

  for (const person of roster) {

    const created = await post("/employees", adminToken, {
      name: person.name,
      email: person.email,
      hireDate: isoDaysAgo(person.tenureDays),
      employmentType: person.employmentType,
      department: person.department,
      role: person.role,
      location: person.location ?? null,
      state: person.state,
      country: person.country,
      managerId: person.managerKey ? employeeIdByKey.get(person.managerKey) : null,
    })

    employeeIdByKey.set(person.key, created.id)
    person.id = created.id
    progress("employee")
  }

  // -------------------------------------------------------------------------
  // Group memberships
  // -------------------------------------------------------------------------

  console.log("Adding group members ...")

  await addMembers(groupId("k401"), adminToken, k401Members, isoDaysAgo(500))
  await addMembers(groupId("beta"), adminToken, betaMembers, isoDaysAgo(300))
  await addMembers(groupId("remote"), adminToken, remoteMembers, isoDaysAgo(400))
  await addMembers(groupId("leadership"), adminToken, leadershipMembers, isoDaysAgo(600))
  await addMembers(groupId("allhands"), adminToken, allHandsMembers, isoDaysAgo(700))
  await addMembers(groupId("legacy_pilot"), adminToken, legacyPilotMembers, isoDaysAgo(600))

  // A membership that joined and later ended, so the group detail page has
  // history to show alongside its current roster.
  await post(`/groups/${groupId("beta")}/members`, adminToken, {
    employeeId: endedMembershipEmployee.id,
    effectiveFrom: isoDaysAgo(400),
  })
  progress("group member")

  await del(
    `/groups/${groupId("beta")}/members/${endedMembershipEmployee.id}?effectiveTo=${isoDaysAgo(120)}`,
    adminToken,
  )
  progress("end membership")

  // -------------------------------------------------------------------------
  // Rules
  // -------------------------------------------------------------------------

  console.log("Creating assignment rules ...")

  for (const rule of buildRuleDefs(policyId, groupId)) {

    await post("/rules", adminToken, rule)
    progress("rule")
  }

  // -------------------------------------------------------------------------
  // Manual overrides
  // -------------------------------------------------------------------------

  console.log("Creating manual overrides ...")

  // WINS: no other rule in time_off touches this employee above priority 100.
  await post(`/employees/${overrideWinEmployee.id}/overrides`, adminToken, {
    policyId: policyId("executive_vacation"),
    name: "Manual override: Executive Vacation (early promotion)",
    effectiveFrom: isoDaysAgo(200),
  })
  progress("override")

  // LOSES: Finance Weekly Pay (DEPARTMENT, priority 600) outranks this.
  await post(`/employees/${financeFullTimeLoser.id}/overrides`, adminToken, {
    policyId: policyId("monthly_pay"),
    name: "Manual override: requested Monthly Pay (denied by policy)",
    priority: 500,
    effectiveFrom: isoDaysAgo(150),
  })
  progress("override")

  // WINS: no competing rule assigns GitHub to a non-Engineering employee.
  await post(`/employees/${overrideAccessEmployee.id}/overrides`, adminToken, {
    policyId: policyId("github"),
    name: "Manual override: GitHub access for cross-functional project",
    effectiveFrom: isoDaysAgo(90),
  })
  progress("override")

  // -------------------------------------------------------------------------
  // Back-dated attribute changes
  // -------------------------------------------------------------------------

  console.log("Applying back-dated attribute changes ...")

  const DEPARTMENTS_CYCLE = ["Engineering", "Sales", "Marketing", "Finance", "People", "Support"]

  for (let i = 0; i < backdateEmployees.length; i++) {

    const person = backdateEmployees[i]
    const effectiveFrom = isoDaysAgo(300 + i * 40)

    if (i % 2 === 0) {

      const newDept = DEPARTMENTS_CYCLE[(DEPARTMENTS_CYCLE.indexOf(person.department) + 1) % DEPARTMENTS_CYCLE.length]

      await patch(`/employees/${person.id}`, adminToken, {
        department: newDept,
        effectiveFrom,
      })
    } else {

      const states = ["CA", "NY", "TX", "WA", "MA"]
      const newState = states[(states.indexOf(person.state) + 1 + states.length) % states.length]

      await patch(`/employees/${person.id}`, adminToken, {
        state: newState,
        effectiveFrom,
      })
    }

    progress("backdate")
  }

  // -------------------------------------------------------------------------
  // Reconcile every active employee through the real engine
  // -------------------------------------------------------------------------

  console.log(`Reconciling ${roster.length} employees through the real engine ...`)

  for (const person of roster) {

    await post(`/reconciliation/employees/${person.id}`, adminToken, {})
    progress("reconcile")
  }

  // -------------------------------------------------------------------------
  // Terminate a couple of employees
  // -------------------------------------------------------------------------

  console.log("Terminating employees ...")

  for (const person of terminatedEmployees) {

    await del(`/employees/${person.id}`, adminToken, { terminatedOn: isoDaysAgo(75) })
    progress("terminate")
  }

  // -------------------------------------------------------------------------
  // Additional users
  // -------------------------------------------------------------------------

  console.log("Creating additional users ...")

  await post("/user", adminToken, {
    name: HR_ADMIN.name,
    email: HR_ADMIN.email,
    password: HR_ADMIN.password,
    role: "HR_ADMIN",
  })

  await post("/user", adminToken, {
    name: managerUserEmployee.name,
    email: MANAGER_USER.email,
    password: MANAGER_USER.password,
    role: "MANAGER",
    employeeId: managerUserEmployee.id,
  })

  await post("/user", adminToken, {
    name: employeeUserEmployee.name,
    email: EMPLOYEE_USER.email,
    password: EMPLOYEE_USER.password,
    role: "EMPLOYEE",
    employeeId: employeeUserEmployee.id,
  })

  console.log("Done.")
  printCredentials(signup.organization)
}

function printCredentials(organization) {

  console.log("")
  console.log("=================================================================")
  console.log(`Demo organization: ${ORG_NAME}${organization ? ` (${organization.id})` : ""}`)
  console.log("=================================================================")
  console.log(`COMPANY_ADMIN  ${ADMIN.email}          / ${ADMIN.password}`)
  console.log(`HR_ADMIN       ${HR_ADMIN.email}             / ${HR_ADMIN.password}`)
  console.log(`MANAGER        ${MANAGER_USER.email}        / ${MANAGER_USER.password}`)
  console.log(`EMPLOYEE       ${EMPLOYEE_USER.email}       / ${EMPLOYEE_USER.password}`)
  console.log("=================================================================")
}

main().catch((err) => {

  console.error("Seed failed:", err)
  process.exitCode = 1
})
