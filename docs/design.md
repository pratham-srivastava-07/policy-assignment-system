# Policy Assignment System — Frontend Design Specification

**Status:** Revised (v2)
**Revised:** 2026-09-02, against `docs/design-review.md` §6 Decisions
**Audience:** Frontend engineers, backend engineers, product/design reviewers
**Design principle:** Make deterministic policy decisions understandable, previewable, and auditable.

---

## 0. How to read this document, and what changed in v2

v1 of this document was reviewed line by line against the codebase. The review
(`docs/design-review.md`) found 71 issues, 11 of them blocking: the document
specified three signature surfaces — the explanation drawer, the policy's
assigned-employee view, and the employee Groups tab — against data and endpoints
the backend did not have, and did not say so.

The author's decisions (`design-review.md` §6) were to **build the missing
backend** rather than respecify the UI around it. That backend work is now
merged. This revision brings the specification into line with what the API
actually returns.

**What changed:**

| Area | v1 | v2 |
|---|---|---|
| Explanation drawer | Specified against `matchedClauses` / `failedClause` that the API always returned empty | Backed by real persisted columns; adds the actual attribute values, a decision→label table, and category filtering |
| Near-miss | Undated claim that it was "computable today" | Backed by stored `NOT_MATCHED` entries; the first-failure semantics are now stated plainly |
| Policy → employees | Drawn, unrouted | `GET /policies/:id/assignments?asOf=` |
| Employee → groups | Drawn, unrouted | `GET /employees/:id/groups?asOf=` |
| Search on rules / policies / audit | Drawn, would have 400'd | `search` param on all three |
| Reconciliation states | Stale / Failed / Reconciling with no signal | `GET /reconciliation/status` and `/events` |
| Personas | One line | §2, with the MVP scoped to admins |
| Required endpoints | Absent | §4, the deliverable the brief asked for |
| Screen inventory | Absent | §5 |
| Design system | Adjectives | §38, concrete tokens |
| Auth, Settings, categories, access, employee create/terminate | Absent | §9, §25, §28, §12, §46 |
| Headings | None; 45 bare numbered lines | Markdown headings and a table of contents |

**Every capability claim in §3 now cites the route or DTO field that backs it.**
A claim without a citation is a bug in this document.

---

## Table of contents

**Ground truth**
1. [Product thesis](#1-product-thesis)
2. [Personas and jobs to be done](#2-personas-and-jobs-to-be-done)
3. [Backend reality](#3-backend-reality)
4. [Required backend endpoints](#4-required-backend-endpoints)
5. [Screen inventory](#5-screen-inventory)

**Frame**

6. [Information architecture](#6-information-architecture)
7. [Global application shell](#7-global-application-shell)
8. [Global time control](#8-global-time-control)
9. [Authentication](#9-authentication)
10. [Permissions and roles](#10-permissions-and-roles)

**Employees**

11. [Employee list](#11-employee-list)
12. [Employee create and terminate](#12-employee-create-and-terminate)
13. [Employee detail](#13-employee-detail)
14. [Assignment explanation drawer](#14-assignment-explanation-drawer)
15. [Near-miss experience](#15-near-miss-experience)
16. [Previewing employee changes](#16-previewing-employee-changes)

**Rules**

17. [Rule list](#17-rule-list)
18. [Rule editor](#18-rule-editor)
19. [Future-proof rule builder architecture](#19-future-proof-rule-builder-architecture)
20. [Rule simulation](#20-rule-simulation)
21. [Rule impact before save](#21-rule-impact-before-save)
22. [Rule detail](#22-rule-detail)
23. [Rule version history](#23-rule-version-history)
24. [Rule lifecycle actions](#24-rule-lifecycle-actions)

**Policies, groups, overrides**

25. [Policy categories](#25-policy-categories)
26. [Policy list](#26-policy-list)
27. [Policy detail](#27-policy-detail)
28. [Application access](#28-application-access)
29. [Groups](#29-groups)
30. [Manual overrides](#30-manual-overrides)

**Operations**

31. [Reconciliation UX](#31-reconciliation-ux)
32. [Audit](#32-audit)
33. [Command palette](#33-command-palette)
34. [Search, filtering and URL state](#34-search-filtering-and-url-state)

**Build**

35. [Data fetching and state](#35-data-fetching-and-state)
36. [Monorepo integration](#36-monorepo-integration)
37. [Frontend architecture](#37-frontend-architecture)
38. [Design system](#38-design-system)
39. [Status semantics](#39-status-semantics)
40. [Loading, empty and error states](#40-loading-empty-and-error-states)
41. [Destructive and assignment-affecting actions](#41-destructive-and-assignment-affecting-actions)
42. [Accessibility](#42-accessibility)
43. [Responsive behavior](#43-responsive-behavior)

**Direction**

44. [Signature user journeys](#44-signature-user-journeys)
45. [Features worth building](#45-features-worth-building)
46. [Settings](#46-settings)
47. [Features explicitly deferred](#47-features-explicitly-deferred)
48. [Implementation phases](#48-implementation-phases)
49. [Acceptance criteria](#49-acceptance-criteria)
50. [Engineering principles](#50-engineering-principles)
51. [The final product feeling](#51-the-final-product-feeling)

[Appendix A — Terminology](#appendix-a--terminology)
[Appendix B — Known backend gaps](#appendix-b--known-backend-gaps)

---

## 1. Product thesis

The Policy Assignment System should not look like a generic HR CRUD dashboard.

Its core advantage is that the system can answer two questions ordinary HR
software usually hides:

**Explain** — Why does this employee have this policy?

**Preview** — What will change if I change this employee or this rule?

The frontend therefore treats explainability and previewability as first-class
product primitives. Every major surface should reinforce one of them.

> **Product promise:** Every policy assignment can be traced back to the rule and
> the employee state that caused it, and important changes can be evaluated
> before they take effect.

---

## 2. Personas and jobs to be done

### 2.1 The MVP is admin-only

**Decision (design-review §6, Q4).** The first frontend serves `COMPANY_ADMIN`
and `HR_ADMIN` only. `MANAGER` and `EMPLOYEE` can authenticate — the API accepts
their sessions — but they land on a single explanatory page rather than a
degraded workspace.

This is not a permissions oversight; it is a scoping decision with a concrete
reason. `GET /employees` is a 403 for `EMPLOYEE` (`routes/employee.ts:40-46`,
`denySelfScopedRole`), so the Employees workspace — the app's landing experience
— has no content for that role. Building a second, self-service information
architecture is a product in its own right and is out of scope here.

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   Not available for your role                                │
│                                                              │
│   The policy workspace is currently available to             │
│   administrators. Your policy assignments are managed by      │
│   your HR team.                                              │
│                                                              │
│   Signed in as ben@acme.com · Employee                       │
│   [ Sign out ]                                               │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The same page serves `MANAGER`. Nothing else in this specification is designed
for those two roles.

**What this does not mean.** Permission-aware rendering is still built (§10) and
is still not authorization. The server enforces; the client only avoids showing
a control that will 403.

### 2.2 Primary persona — HR / People Ops administrator

`HR_ADMIN`. Runs people operations day to day. Holds every permission except
`org:write` and `member:write` (`permissions.ts` `ROLE_PERMISSIONS`), including
`employee:backdate`, so they can record changes that already happened.

**Jobs to be done, in the order they occur in a working day:**

| # | Job | Primary surface | Backed by |
|---|---|---|---|
| J1 | "Sarah in Engineering says she's missing a stipend — why?" | Employee detail → Policies → Why? | `GET /assignments/:id/explanation` |
| J2 | "Sarah is moving to Sales on the 1st. What breaks?" | Employee edit → Preview | `POST /employees/:id/preview` |
| J3 | "Legal wants everyone in CA on the new meal-break training." | Rule editor → simulate → create | `POST /rules/simulate`, `POST /rules` |
| J4 | "Who exactly does this rule hit before I turn it on?" | Rule detail → matching employees | `GET /rules/:id/matching-employees` |
| J5 | "This contractor is paid monthly, no matter what the rules say." | Employee → Overrides → create | `POST /employees/:id/overrides` |
| J6 | "What did this employee have on January 1?" | Global `asOf` | `?asOf=` on the point-in-time reads (§8.2) |
| J7 | "Who changed this rule's priority, and when?" | Audit, rule version history | `GET /audit-events`, `GET /rules/:id/versions` |
| J8 | "Did that change actually get applied everywhere?" | Reconciliation status | `GET /reconciliation/status` |
| J9 | "New hire starts Monday — what will she get?" | Employee create → reconcile → Policies | §12.1 |

### 2.3 Secondary persona — Company administrator

`COMPANY_ADMIN`. Everything `HR_ADMIN` has, plus organization settings and
teammate management (`org:write`, `member:write`). Their additional surface is
§46 Settings and nothing else.

### 2.4 Explicit non-goals for this MVP

- A manager self-service view of their reporting line.
- An employee self-service view of their own policies.
- An invite flow. `POST /auth/signup` creates a **new organization** every time
  (`services/auth.ts`); there is no join-existing-org path. Additional users are
  created by a `COMPANY_ADMIN` through `POST /user` (§46).

---

## 3. Backend reality

The frontend must be designed around capabilities that exist. Every line below
names the route or DTO field that backs it.

### 3.1 Supported, verified

| Capability | Backed by |
|---|---|
| Point-in-time resolution | `?asOf=` on the ten reads listed in §8.2 |
| Per-rule resolution trail, winners **and** losers | `AssignmentExplanationDTO.trail`, six `RESOLUTION_DECISIONS` |
| Matched clauses per rule | `ResolutionTrailEntryDTO.matchedClauses` |
| Failed clause per rule | `ResolutionTrailEntryDTO.failedClause` |
| The employee's actual value, as evaluated | `ResolutionTrailEntryDTO.attributeValues` |
| Employee dry-run preview | `POST /employees/:id/preview` → `PreviewDTO` |
| Rule simulation (unsaved rule) | `POST /rules/simulate` |
| Rule matching-employee preview (saved rule) | `GET /rules/:id/matching-employees` |
| Rule version history | `GET /rules/:id/versions` → `RuleVersionDTO[]` |
| Employee attribute history | `GET /employees/:id/attribute-history` |
| Employee group membership, point-in-time | `GET /employees/:id/groups?asOf=` |
| Policy → assigned employees, point-in-time | `GET /policies/:id/assignments?asOf=` |
| Assignment explanation | `GET /assignments/:id/explanation` |
| Audit log with text search | `GET /audit-events?search=` |
| Manual overrides: create, read, revoke | `POST`/`GET /employees/:id/overrides`, `DELETE /overrides/:id` |
| Per-employee reconciliation (synchronous) | `POST /reconciliation/employees/:id` |
| Reconciliation backlog and failures | `GET /reconciliation/status`, `GET /reconciliation/events` |
| Category cardinality SINGLE / MULTIPLE | `PolicyCategoryDTO.cardinality` |
| Effective dates, day-granular half-open `[from, to)` | `effectiveFrom` / `effectiveTo` on assignments, rules, memberships |
| Back-dating as a gated capability | `employee:backdate`, `requireBackdatePermission()` |
| Manager / subtree scoping | `requireSubtreeScope` on `/employees/*` and `/access` |
| RBAC | `ROLE_PERMISSIONS` in `@policy/shared` |
| Application access as a policy category | `GET`/`PUT`/`PATCH /access` |

### 3.2 Three subtleties that change the UI

These are true, load-bearing, and easy to get wrong.

**(a) The evaluator short-circuits.** `evaluateConditions` stops at the first
clause that fails and reports exactly that one. So `failedClause` means *"the
first clause that did not hold"*, not *"the only clause that did not hold"*. A
rule failing clause 1 of 5 and a rule failing clause 5 of 5 are indistinguishable
in the trail. **The near-miss UI must never say "one condition away" (§15).**

The one thing that is *not* short-circuited is `attributeValues`: the engine
reads the employee's value for **every** attribute the rule names, whether or not
evaluation reached that clause. This is what lets the drawer show the employee's
side of a clause that was never tested.

**(b) `MATCHED_LOST` means something different in MULTIPLE categories.** In a
SINGLE category it means "a higher-ordered rule won this category". In a MULTIPLE
category it means "this policy was already claimed by a higher-ordered rule".
Branch the label on `cardinality`, or render `reason` verbatim (§14.4).

**(c) The trail belongs to an evaluation, not to an assignment.** The explanation
returns every rule considered in the evaluation *that most recently touched this
assignment*, across **all** categories — and an unchanged assignment gets a fresh
evaluation row on every reconcile. Two consequences: the drawer must filter the
trail to the assignment's own `categoryId`, and it must label the trail with the
evaluation's date, because the trail can legitimately name rules that did not
exist when the assignment was first created (§14.5).

### 3.3 Not supported — do not simulate in the client

| Not available | What the UI must do instead |
|---|---|
| Organization-wide reconciliation runs / campaigns | §31.4 — per-employee only; no progress bar |
| Realtime events; no websocket, no SSE | Refetch on focus and on an explicit refresh |
| Dashboard aggregates | §6.1 — no dashboard |
| Organization-wide conflict inventory | Conflicts are visible per employee, in the drawer |
| Nested AND/OR condition trees | §18 — flat AND-only, modelled as a tree internally (§19) |
| Bulk mutations | No row selection, no bulk bar (§11.3) |
| Optimistic concurrency on rule edits | §40.4 — last write wins; no 409 exists to render |
| Saved views, notifications, CSV export | Deferred (§47) |
| Distinct attribute values for a picker | §18.4 — free text with an exactness warning |
| Rule counts on `PolicyDTO`, member counts on `GroupDTO` | §26, §29 — columns omitted |
| Assignment history for one employee | §13.4 — Timeline is attribute + group history only |
| Reading a soft-deleted group by id | §29.5 — a deleted group renders as an unresolvable reference |
| Policy archive triggering reconciliation | §41.3 — the confirmation must say so |

---

## 4. Required backend endpoints

The deliverable the brief asks for: what exists, what was added for this
frontend, and what is still missing.

### 4.1 Existed before this design

Base path `/api/v1`. All authenticated routes require `Authorization: Bearer <token>`.

```
POST   /auth/signup · /auth/login · /auth/logout          GET /auth/me
POST   /user   GET /user   GET /user/search   GET/PATCH/DELETE /user/:id

GET    /employees                       POST /employees
GET    /employees/:id                   PUT/PATCH /employees/:id
DELETE /employees/:id                   (termination, not deletion)
GET    /employees/:id/attribute-history
GET    /employees/:id/assignments?asOf=
POST   /employees/:id/preview           (EXPENSIVE)
GET    /employees/:id/overrides         POST /employees/:id/overrides
GET    /employees/:id/audit
DELETE /overrides/:id

GET    /groups   POST /groups           GET/PUT/PATCH/DELETE /groups/:id
GET    /groups/:id/members?asOf=        POST /groups/:id/members
DELETE /groups/:id/members/:employeeId

GET    /policy-categories               POST /policy-categories
GET/PATCH/DELETE /policy-categories/:id

GET    /policies   POST /policies       GET/PUT/PATCH/DELETE /policies/:id

POST   /rules/simulate                  (EXPENSIVE)
GET    /rules      POST /rules          GET/PATCH/DELETE /rules/:id
GET    /rules/:id/versions
GET    /rules/:id/matching-employees?asOf=   (EXPENSIVE)
PATCH  /rules/:id/priority
POST   /rules/:id/enable · /rules/:id/disable

GET    /assignments?employeeIds=&asOf=  (EXPENSIVE, max 100 ids)
GET    /assignments/:id/explanation
GET    /access?asOf=   PUT /access   PATCH /access
POST   /reconciliation/employees/:id    (EXPENSIVE, synchronous)
GET    /audit-events
```

### 4.2 Added for this frontend — shipped

Per design-review §6 Q1, Q3, Q6, Q7.

| Endpoint / change | Unblocks | Notes |
|---|---|---|
| `matched_clauses`, `failed_clause`, `attribute_values` on `assignment_resolution_events` | §14, §15 | Migration `20260902000000_resolution_event_clauses`. Rows written **before** it keep `[]` / `null` / `{}` — see §14.7 |
| `GET /employees/:id/groups?asOf=` | §13.3, §29 | Returns `EmployeeGroupMembershipDTO[]`; includes `groupName`, so no N+1 |
| `GET /policies/:id/assignments?asOf=` | §27.3 | `PolicyAssignmentDTO` carries `employeeName`, `employeeEmail`, `resolutionStatus` |
| `search` on `GET /rules` | §17 | Matches `name` |
| `search` on `GET /policies` | §26 | Matches `name` |
| `search` on `GET /audit-events` | §32 | Matches `action` **or** `entityType` — the row's only text columns. It is **not** an actor-name search |
| `GET /reconciliation/status` | §31.3 | `{ counts: Record<OutboxStatus, number>, oldestPendingAt }` |
| `GET /reconciliation/events` | §31.5 | Filterable by `status`, `aggregateType`, `aggregateId` |
| Self/subtree scope guard on `GET /assignments/:id/explanation` | §10.4 | Closed a real gap: any `EMPLOYEE` could previously read any assignment's explanation by id |

> **Not yet verified against a running system.** The migration is unapplied and
> these endpoints are un-exercised — Docker was unavailable when they were
> written. `design-review.md` §"Before this can be trusted" holds the checklist.
> Treat §14, §15, §27.3, §13.3 and §31 as *specified against merged code*, not
> as *demonstrated*.

### 4.3 Still missing — the UI works around each one

| Missing | Worked around in |
|---|---|
| `ruleCount` on `PolicyDTO` | §26 — column omitted |
| `memberCount` on `GroupDTO` | §29.1 — count fetched only on group detail |
| Distinct values per attribute | §18.4 — free text plus an exactness warning |
| `GET /employees/:id/assignments/history` | §13.4 — Timeline excludes assignments |
| Read a soft-deleted group by id | §29.5 — unresolvable-reference state |
| Actor name on `AuditEventDTO` | §32.3 — batch lookup + cache |
| Optimistic concurrency on `PATCH /rules/:id` | §40.4 — no conflict error to render |
| Reconciliation enqueue on policy archive | §41.3 — stated in the confirmation |
| Aggregate audit row for a rule fan-out | §32.2 — the line is removed |
| `asOf` on `GET /employees` and `GET /employees/:id` | §8.3 — historical-mode banner |
| Per-field validation errors | §40.2 — form-level banner |

---

## 5. Screen inventory

| # | Screen | Route | Phase | Primary endpoint |
|---|---|---|---|---|
| 1 | Login | `/login` | 1 | `POST /auth/login` |
| 2 | Signup (creates an organization) | `/signup` | 1 | `POST /auth/signup` |
| 3 | Role-unavailable | `/unavailable` | 1 | `GET /auth/me` |
| 4 | Employee list | `/employees` | 2 | `GET /employees` |
| 5 | Employee create | `/employees/new` | 2 | `POST /employees` |
| 6 | Employee detail — Policies | `/employees/:id` | 2 | `GET /employees/:id/assignments` |
| 7 | Employee detail — Attributes | `/employees/:id/attributes` | 2 | `GET /employees/:id/attribute-history` |
| 8 | Employee detail — Groups | `/employees/:id/groups` | 2 | `GET /employees/:id/groups` |
| 9 | Employee detail — Timeline | `/employees/:id/timeline` | 7 | attribute + group history |
| 10 | Employee detail — Audit | `/employees/:id/audit` | 7 | `GET /employees/:id/audit` |
| 11 | Employee edit + preview | modal on 6 | 2 | `POST /employees/:id/preview` |
| 12 | Explanation drawer | overlay | 3 | `GET /assignments/:id/explanation` |
| 13 | Near-miss section | within 6 | 3 | same trail as 12 |
| 14 | Policy list | `/policies` | 4 | `GET /policies` |
| 15 | Policy detail | `/policies/:id` | 4 | `GET /policies/:id`, `GET /rules?policyId=` |
| 16 | Policy → assigned employees | `/policies/:id/employees` | 4 | `GET /policies/:id/assignments` |
| 17 | Policy category list / create | `/settings/categories` | 4 | `/policy-categories` |
| 18 | Rule list | `/rules` | 5 | `GET /rules` |
| 19 | Rule detail | `/rules/:id` | 5 | `GET /rules/:id` |
| 20 | Rule editor (create / edit) | `/rules/new`, `/rules/:id/edit` | 5 | `POST`/`PATCH /rules` |
| 21 | Rule simulation panel | within 20 | 5 | `POST /rules/simulate` |
| 22 | Rule matching employees | within 19 | 5 | `GET /rules/:id/matching-employees` |
| 23 | Rule version history + diff | `/rules/:id/versions` | 7 | `GET /rules/:id/versions` |
| 24 | Group list | `/groups` | 6 | `GET /groups` |
| 25 | Group detail + members | `/groups/:id` | 6 | `GET /groups/:id/members` |
| 26 | Override create / revoke | modal on 6 | 6 | `/employees/:id/overrides` |
| 27 | Reconciliation status strip | header widget | 6 | `GET /reconciliation/status` |
| 28 | Reconciliation events | `/settings/reconciliation` | 6 | `GET /reconciliation/events` |
| 29 | Audit log | `/audit` | 7 | `GET /audit-events` |
| 30 | Settings — teammates, organization | `/settings` | 8 | `/user`, `/auth/me` |

---

## 6. Information architecture

The primary navigation is intentionally small.

```
Employees
Rules
Policies
Groups
────────
Audit
Settings
```

### 6.1 Why there is no dashboard

The backend has no aggregate metrics API. A dashboard assembled from client-side
N+1 requests would be slower and less honest than not having one. The landing
experience is the Employees workspace. A dashboard can be added when aggregate
endpoints exist.

### 6.2 Why Assignments is not a top-level item

Assignments are derived from employees, policies and rules. They are not
independently managed records, and a top-level section would imply they can be
edited directly. They are reachable through:

- Employee → Policies
- Policy → Employees (§27.3)
- Rule → Matching employees
- The explanation drawer
- Audit history

### 6.3 Why Reconciliation is not a top-level page

Reconciliation is per employee; there is no run or campaign entity. It appears
as an action on the employee page, a quiet status strip in the header, and a
diagnostic list under Settings (§31).

> **v1 correction.** v1 said reconciliation would be "a lightweight freshness
> state" and then specified Stale / Failed / Reconciling badges that nothing
> could produce. With `GET /reconciliation/status` and `/events` now available,
> those states are real — but they are **organization-level backlog states, not
> per-employee ones**. §31.3 says exactly what each badge means.

---

## 7. Global application shell

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Acme Inc · Policy                Search ⌘K      ⟳ 3 pending    User ▾   │
├───────────────┬──────────────────────────────────────────────────────────┤
│  Employees    │                                                          │
│  Rules        │                 APPLICATION CONTENT                      │
│  Policies     │                                                          │
│  Groups       │                                                          │
│  ───────────  │                                                          │
│  Audit        │                                                          │
│  Settings     │                                                          │
└───────────────┴──────────────────────────────────────────────────────────┘
```

Requirements:

- Persistent left navigation on desktop; collapsed to icons on tablet; a sheet on mobile.
- Current section clearly indicated.
- Permission-aware: Settings appears only for `COMPANY_ADMIN` (§10.3).
- Organization name always visible — a user can belong to more than one.
- `⌘K` / `Ctrl+K` opens the command palette from anywhere.
- `⟳ 3 pending` is the reconciliation backlog indicator (§31.3). It is **absent**
  when the backlog is zero. It is never a spinner.

Do not put metrics or decoration in the sidebar.

---

## 8. Global time control

The data model supports point-in-time resolution. This should be a visible
global interaction — it turns ordinary CRUD pages into a historical inspection
tool.

```
As of:  Sep 2, 2026  [ Today ▾ ]
```

The date is encoded in the URL and preserved across navigation:

```
/employees/8f3c…?asOf=2026-01-01
```

### 8.1 UI rules

- Default to today; `asOf` is then omitted from the URL entirely.
- When `asOf` is not today, the app is in **historical mode**: a persistent amber
  bar under the header, all write controls hidden, and the date shown beside every
  page title.
- Never render assignment effective periods with time-of-day precision.
  Effective dates are **day-granular** (`DATE`). Audit events are timestamps
  (`TIMESTAMPTZ`). Mixing the two is a category error — see §32.4.

### 8.2 Exactly which reads honour `asOf`

**Honour it:**

```
GET /employees/:id/assignments      GET /employees/:id/groups
GET /policies/:id/assignments       GET /groups/:id/members
GET /rules/:id/matching-employees   GET /assignments
GET /access                         POST /rules/simulate
POST /employees/:id/preview         POST /reconciliation/employees/:id
```

**Do not** (their schemas are `.strict()`, so an `asOf` param is a 400):

```
GET /employees        GET /employees/:id     GET /rules      GET /policies
GET /groups           GET /audit-events      GET /reconciliation/{status,events}
```

### 8.3 What historical mode cannot do, and how to say so

`GET /employees/:id` returns **current** attributes with no `asOf`, and
`tenureDays` is computed against today. Under `asOf=2026-01-01` the employee
header would therefore show today's department beside January's assignments.

**Rule:** in historical mode the employee header shows current values with an
explicit note, and the Attributes tab — which reconstructs from
`/employees/:id/attribute-history` — is the historical source.

```
┌──────────────────────────────────────────────────────────┐
│ Alice Chen                                               │
│ Engineering · Full-time · California                     │
│ ⓘ Showing current attributes. Policies below are as of   │
│   Jan 1, 2026. See Attributes for values on that date.   │
└──────────────────────────────────────────────────────────┘
```

### 8.4 Two edge cases that must be designed, not discovered

**Before the hire date.** Assignments come back empty and tenure clamps to zero.
Do not render an empty table:

```
Alice Chen was not employed on Jan 1, 2025.
Hired Mar 14, 2025.                    [ Jump to hire date ]
```

**Zero-length intervals.** A reconcile closes an assignment with
`effectiveTo = asOf` and opens the replacement with `effectiveFrom = asOf` in one
transaction. Edit a rule twice in one day and a `[today, today)` row exists — a
correct, real, empty interval. **Any timeline or history view must drop intervals
where `effectiveFrom === effectiveTo`.** They are supersession artefacts, not
events, and rendering them produces a confusing ladder of same-day rows.

---

## 9. Authentication

### 9.1 Screens

**Login** — email, password, submit. On success, store the token (§9.2) and
redirect to `/employees`, or to the `?next=` path if present.

**Signup** — name, email, password, **organization name**. The copy must be
honest about what this does:

```
Create an organization

This creates a new organization with you as its administrator.
To join an existing organization, ask its administrator to add you.
```

`POST /auth/signup` creates a new organization every time. There is no join flow.

**Logout** — `POST /auth/logout`, clear the token, redirect to `/login`.

### 9.2 Token storage

`POST /auth/login` returns a bearer token; sessions last 7 days. The API is
called from the browser with `Authorization: Bearer <token>`.

**Store it in `sessionStorage`, keyed to the origin.** Rationale: the API sets no
cookie and has no CSRF protection, so a cookie would need backend work;
`sessionStorage` is cleared when the tab closes, which is a better default for an
HR tool on a shared machine than `localStorage`. The token never enters the URL
and never enters application state that gets logged.

> **Open for the author.** This was question 5 in the review and remains the one
> decision here made by the document rather than by you. If you want
> `localStorage` (survives a tab close) or a backend-set httpOnly cookie
> (immune to XSS, needs a CSRF token), say so — it changes only `lib/auth`.

### 9.3 401 handling

Any 401 from any request — `UNAUTHENTICATED`, `SESSION_EXPIRED`,
`SESSION_REVOKED` — clears the token and redirects to
`/login?next=<current path>`. This lives in the API client interceptor (Phase 1),
not in individual screens.

### 9.4 The multi-organization 409

`POST /auth/login` returns 409 when the email belongs to more than one
organization. Render an organization chooser, not a generic error.

---

## 10. Permissions and roles

### 10.1 Permissions are derived, not fetched

`GET /auth/me` returns `{ user, organization, role }`. **It does not return a
permission list.** The client derives permissions from `role` using
`ROLE_PERMISSIONS`, imported from `@policy/shared` — which makes the workspace
integration in §36 a hard Phase 1 dependency, not a convenience.

```ts
import { ROLE_PERMISSIONS, PERMISSIONS } from "@policy/shared"

const can = (role: OrganizationRole, permission: Permission) =>
  ROLE_PERMISSIONS[role].includes(permission)
```

### 10.2 The grants

| Role | Grants |
|---|---|
| `COMPANY_ADMIN` | Everything |
| `HR_ADMIN` | Everything except `org:write` and `member:write` |
| `MANAGER` | Every `:read` permission, no writes |
| `EMPLOYEE` | `employee:read`, `assignment:read` only |

Two constraints are **not** expressible as permission strings and are enforced by
middleware instead: `EMPLOYEE` is confined to their own record, and `MANAGER` to
their own org-chart subtree.

### 10.3 Role × screen, for the roles this MVP serves

| Screen | `COMPANY_ADMIN` | `HR_ADMIN` |
|---|---|---|
| Employees, list and detail | full | full |
| Employee create / edit / terminate | ✓ | ✓ |
| Back-dated effective dates | ✓ | ✓ |
| Preview, reconcile | ✓ | ✓ |
| Rules, policies, categories, groups | full | full |
| Overrides create / revoke | ✓ | ✓ |
| Audit | ✓ | ✓ |
| Reconciliation events | ✓ | ✓ |
| Settings → teammates | ✓ | hidden (`member:write`) |
| Settings → organization | ✓ | hidden (`org:write`) |

`MANAGER` and `EMPLOYEE` see §2.1's page and nothing else.

### 10.4 Rules for the client

- Hide actions the user cannot perform; never disable-with-tooltip a control
  whose permission the user will never gain.
- Client-side hiding is **not** authorization. The server enforces.
- A 403 that reaches the UI is a bug in the client's permission logic. Log it
  loudly in development; render §40.3's forbidden state in production.

---

## 11. Employee list

Employees are the primary workspace.

```
Employees                                              + Add employee
1,284 employees

[ Search employees…                                  ]

[Department ▾] [State ▾] [Role ▾] [Employment type ▾] [Status: Active ▾]

┌────────────────────────────────────────────────────────────────────────┐
│ Employee            Department      Role         Location   Type       │
├────────────────────────────────────────────────────────────────────────┤
│ Alice Chen          Engineering     Staff Eng    CA         FULL_TIME  │
│ ben@acme.com                                                           │
├────────────────────────────────────────────────────────────────────────┤
│ Ben Carter          Sales           AE           NY         FULL_TIME  │
└────────────────────────────────────────────────────────────────────────┘

                                            25 of 1,284   ‹ 1 2 3 … 52 ›
```

### 11.1 Columns, and the three that were cut

**Default columns:** Name (with email beneath), Department, Role, Location,
Employment type.

Three columns from v1 are **removed**, each for a stated reason:

- **Groups** — `GET /employees/:id/groups` is per employee. A column would be one
  request per row. Groups live on the employee detail page (§13.3).
- **Policy count** — only obtainable via `GET /assignments?employeeIds=`, which is
  EXPENSIVE-tier and keyed by **organization** (5 burst, 20/min). One page of 25
  rows would spend a burst token that every other admin in the tenant shares.
- **Freshness / status** — reconciliation state is an organization-level backlog
  (§31.3), not a per-employee field. There is nothing to put in the cell.

This is the same principle §26 applies to policy rule counts: *counts are shown
only when the backend can produce them in one request.*

### 11.2 Filters that exist

`department`, `state`, `country`, `location`, `employmentType`, `role`,
`isManager`, `status`, `search` — all exact-match except `search`.

**Cut from v1:** the `[Group]` filter (no `group` param) and column sorting (no
`sort` param; the repository orders by `name asc`, always). Column headers must
therefore not look sortable.

### 11.3 Status defaults to Active

The API deliberately does **not** filter to ACTIVE by default — a client that
wants active employees asks for them. The UI applies `status=ACTIVE` on first
load and shows it as a visible, removable filter chip, so the default is
discoverable rather than hidden.

### 11.4 Table mechanics

- Page size 25 (the API default). "View all" is not offered; the API caps at 100.
- Search debounce 300 ms; the in-flight request is cancelled on the next keystroke.
- All filters are URL state (§34).
- **No row selection.** There are no bulk mutation endpoints, so a selection
  checkbox would promise something that does not exist.

---

## 12. Employee create and terminate

### 12.1 Create

`POST /employees` requires `name`, `email`, `hireDate`, `employmentType`.
Optional: `department`, `role`, `location`, `state`, `country`, `managerId`,
`isManager`, and a gated `effectiveFrom`.

```
Add employee

Name          [ Sarah Kim                    ]
Email         [ sarah@acme.com               ]
Hire date     [ 2026-09-15                   ]
Employment    [ FULL_TIME              ▾     ]
Department    [ Engineering                  ]
Role          [ Software Engineer            ]
Location      [ San Francisco  ] State [ CA ] Country [ US ]
Manager       [ 🔍 Alice Chen                ]

Effective from  ⦿ Hire date   ○ Earlier date   ← only with employee:backdate

  ⓘ Policies are assigned when this employee is first reconciled.
    You can preview them on their page immediately after saving.

                                     [ Cancel ]  [ Create employee ]
```

**Onboarding preview is not available on this form.** `POST /employees/:id/preview`
needs an existing id. CLAUDE.md's onboarding scenario ("✓ Engineering Vacation
Policy, ✓ GitHub, ✓ Slack") is therefore reachable one step later: create, then
land on the employee page, where §16's preview and §31.2's Reconcile now both
work. The form says so rather than implying otherwise.

### 12.2 Terminate

`DELETE /employees/:id` is a **termination**, not a deletion: it sets
`status = TERMINATED` and a `terminatedOn` date so the assignment history
survives. Label the action **Terminate employee**, never Delete.

```
Terminate Alice Chen?

Last day of employment  [ 2026-09-30 ]

Alice will keep her policy history and remain searchable.
She will be excluded from future rule evaluation.
Her current assignments are not ended by this action —
they end when she is next reconciled.

                              [ Cancel ]  [ Terminate ]
```

### 12.3 The terminated state

On a terminated employee's page:

- A grey banner: `Terminated Sep 30, 2026`.
- **Reconcile now** and **Preview a change** are hidden. Reconciling a
  terminated employee is a 409, and the worker skips them.
- Policies, Attributes, Groups, Timeline and Audit remain fully readable.

---

## 13. Employee detail

The most important page in the application.

```
← Employees

Alice Chen                          [ Preview a change ]  [ Reconcile now ]  [ ⋯ ]
alice@acme.com
Engineering · Full-time · California · Hired Mar 14, 2023

Policies · Attributes · Groups · Timeline · Audit
```

The `⋯` menu holds Edit, Add manual override, Terminate.

### 13.1 Policies tab

```
Policies as of Sep 2, 2026                                        5 assigned

┌──────────────────────────────────────────────────────────────────────────┐
│ Policy                   Category      Source                            │
├──────────────────────────────────────────────────────────────────────────┤
│ CA Meal Break Training   Compliance    California Employees   v3   Why? │
│                          MULTIPLE      Effective Jan 1, 2026             │
├──────────────────────────────────────────────────────────────────────────┤
│ Vacation — Executive     Time Off      ⚑ Manual override        Why?    │
│                          SINGLE        Effective Jun 1 → Dec 31, 2026    │
└──────────────────────────────────────────────────────────────────────────┘

▸ Nearly matched (3)
```

Each row shows the policy, its category and cardinality, the source rule with the
**version that produced it**, the effective window, and a `Why?` affordance.

There is no Status column. Every row returned is an assignment that is in effect
on `asOf`; a "Status: Assigned" column would carry no information. Manual
overrides are marked with the ⚑ flag and the source label (§30).

### 13.2 Attributes tab

Current values, and history from `GET /employees/:id/attribute-history`. In
historical mode this is the authoritative view of the employee's state on the
selected date (§8.3).

```
Department      Engineering
                Sales → Engineering        Jan 1, 2026
                (hired into Sales)         Mar 14, 2023

State           CA
                NY → CA                    Jun 1, 2025
```

### 13.3 Groups tab

Backed by `GET /employees/:id/groups?asOf=`, which returns `groupName` — no
per-group lookup needed.

```
Groups as of Sep 2, 2026                                   [ + Add to group ]

Engineering        Joined Mar 14, 2023
Managers           Joined Jan 1, 2026
Remote             Jun 1, 2024 → Mar 1, 2026        (ended)
```

Ended memberships are shown greyed, because a rule evaluated at a past `asOf`
may still depend on one.

### 13.4 Timeline tab

**Attribute changes and group membership changes only.** Assignment history is
not exposed by any endpoint (`findHistoryForEmployee` exists in the repository
but is unrouted, §4.3), so a timeline claiming to show "when policies changed"
would be fabricating.

The tab header says what it covers:

```
Timeline — attribute and group membership changes.
Assignment history is not yet available.
```

Zero-length intervals are dropped here (§8.4).

### 13.5 Audit tab

`GET /employees/:id/audit` filters to `entityType = employee`. It shows employee
edits, terminations and reconciliation runs — **not** assignment created/ended
events, which are written with `entityType = assignment` and carry the employee
only in metadata, which the API cannot filter on.

Say so, and offer the route that does work:

```
Employee changes only. Assignment events are recorded separately —
open a policy's Why? drawer to see the decisions behind it.
```

---

## 14. Assignment explanation drawer

The application's signature interaction. Backed by
`GET /assignments/:id/explanation` → `AssignmentExplanationDTO`.

### 14.1 Where it opens from

Employee policy rows · policy assigned-employee rows · the command palette.

**Not** from audit rows: an `AuditEventDTO` for `assignment.created` carries the
assignment id in `metadata`, and the audit feed cannot be filtered by it — so a
`Why?` link there would sometimes 404. Removed from v1's list.

### 14.2 The drawer

```
┌────────────────────────────────────────────────────────────────────────┐
│ Why does Alice Chen have this policy?                            Close │
├────────────────────────────────────────────────────────────────────────┤
│ CA Meal Break Training                                                 │
│ Compliance · MULTIPLE · Effective Jan 1, 2026 →                        │
│                                                                        │
│ ⓘ Assigned by Rule v3. The current rule is v4.        [ Compare ]     │
│                                                                        │
│ Decisions from the evaluation of Sep 2, 2026 · 09:44                   │
│ ────────────────────────────────────────────────────────────────────── │
│                                                                        │
│ ● WON        California Employees                    LOCATION · 800    │
│                                                                        │
│              ✓ state equals CA                                         │
│                Alice: CA                                               │
│              ✓ employmentType equals FULL_TIME                         │
│                Alice: FULL_TIME                                        │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│                                                                        │
│ ● NOT APPLIED   Standard Meal Break Training          DEFAULT · 100    │
│                                                                        │
│              ✓ All conditions matched                                  │
│              Already assigned by a higher-ordered rule                 │
│                                                                        │
│ ────────────────────────────────────────────────────────────────────── │
│                                                                        │
│ ● NO MATCH   Contractor Training                          ROLE · 500   │
│                                                                        │
│              ✕ employmentType equals CONTRACTOR                        │
│                Alice: FULL_TIME                                        │
│                                                                        │
│              ⓘ Evaluation stops at the first condition that fails.     │
│                 Later conditions were not tested.                      │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

### 14.3 Every field, and where it comes from

| Shown | Source |
|---|---|
| Policy name, category, cardinality | `AssignmentDTO.policyName`, `categoryName`, `cardinality` |
| Effective window | `AssignmentDTO.effectiveFrom` / `effectiveTo` |
| Rule name, type, priority | `ResolutionTrailEntryDTO.ruleName`, `ruleType`, `priority` |
| Rule version banner | `AssignmentDTO.sourceRuleVersion` vs the rule's current `version` |
| ✓ matched conditions | `trail[].matchedClauses` |
| ✕ failed condition | `trail[].failedClause` |
| "Alice: CA" | `trail[].attributeValues[attribute]` |
| Free-text reason | `trail[].reason` |
| Rule text as it stood | `AssignmentExplanationDTO.sourceRuleVersion` |

**"Alice: CA" comes from the evaluation's own record**, not from Alice's current
employee row. This matters: for a January assignment, today's `state` is the
wrong value, and v1 would have shown it.

### 14.4 Decision → label

Six decisions exist. v1 used three labels and mapped `NOT_MATCHED` to "SKIPPED",
which is wrong — a rule that was evaluated and did not match was not skipped.

| Decision | Label | Colour | Body |
|---|---|---|---|
| `MATCHED_WON` | **WON** | green | matched conditions with values |
| `MATCHED_LOST` (SINGLE) | **LOST** | amber | "Lost to a higher-priority rule" |
| `MATCHED_LOST` (MULTIPLE) | **NOT APPLIED** | amber | "Already assigned by a higher-ordered rule" |
| `NOT_MATCHED` | **NO MATCH** | grey | the failed condition + the short-circuit note |
| `SKIPPED_DISABLED` | **SKIPPED** | grey | "Rule is disabled" |
| `SKIPPED_OUT_OF_WINDOW` | **SKIPPED** | grey | "Outside its effective dates on this day" |
| `SKIPPED_POLICY_INACTIVE` | **SKIPPED** | grey | "Its policy is draft or archived" |

The `MATCHED_LOST` split is required: in a MULTIPLE category "lost to a
higher-priority rule" is simply false, and §27.4 forbids implying a single winner
there. If in doubt, render `reason` verbatim — the engine writes it correctly.

### 14.5 Filter the trail to this assignment's category

The explanation returns every rule considered in that evaluation, across **all**
categories. An unfiltered drawer would list the pay-schedule rules under a
question about meal-break training.

**Rule:** show `trail.filter(e => e.categoryId === assignment.categoryId)`.
Offer the rest behind a disclosure:

```
▸ Show 14 decisions from other policy categories
```

### 14.6 Label the trail with its date

The trail is the *most recent* evaluation that touched this assignment, not the
one that created it — every reconcile writes a fresh set. So the trail can name
rules created after the assignment was made. The header line
`Decisions from the evaluation of Sep 2, 2026 · 09:44` is not decoration; it is
what makes the panel truthful.

### 14.7 Assignments explained before the clause migration

Decisions recorded before `20260902000000_resolution_event_clauses` have
`matchedClauses = []`, `failedClause = null`, `attributeValues = {}`. This is
correct — nothing is fabricated for a decision made before the record existed.

Render the fallback rather than an empty rule card:

```
● WON        California Employees                     LOCATION · 800

             Matched state = CA and employmentType = FULL_TIME

             ⓘ Condition detail was not recorded for this evaluation.
                Reconcile Alice to capture it.
```

The fallback body is `trail[].reason`, which every row has always had.

---

## 15. Near-miss experience

A collapsed section on the employee page. Its purpose is not to add a feature; it
is to surface failed-clause information that already exists.

```
▸ Nearly matched (3)

  ┌──────────────────────────────────────────────────────────────────┐
  │ Executive Vacation                          Time Off · SINGLE    │
  │                                                                  │
  │ Did not match:  tenureDays at least 1,825  (≈ 5 years)           │
  │ Alice:          1,268 days  (3 years 5 months)                   │
  │                                                                  │
  │ ⓘ Evaluation stops at the first condition that fails; this rule  │
  │    may have other conditions that were not tested.               │
  └──────────────────────────────────────────────────────────────────┘
```

### 15.1 Where the data comes from

The same trail as §14: entries with `decision === "NOT_MATCHED"`, whose
`failedClause` and `attributeValues` are now persisted. **No extra request, no
EXPENSIVE call, no fake no-op preview.** v1 would have needed one preview call
per employee-page load, against an organization-keyed budget of 5.

### 15.2 The honesty constraint

**Never say "one condition away".** The engine short-circuits (§3.2a), so a rule
failing its first of five conditions and a rule failing its fifth of five are
indistinguishable in the data. The permitted phrasing is *"Did not match:"* plus
the note above. Anything stronger is a claim the backend cannot support.

### 15.3 Tenure conversion

`tenureDays` is calendar-day arithmetic. Leap years mean 5 years ≠ 1,825 days
exactly. **The UI converts at 365 days per year and always shows both**:

```
tenureDays at least 1,825  (≈ 5 years)
```

Never show a years figure alone; never compute a "days remaining" countdown,
which would imply a precision the conversion does not have. (v1's "578 days
remaining" is removed for this reason.)

### 15.4 What is not shown

Entries with a `SKIPPED_*` decision. A rule skipped because it is disabled or its
policy is archived is not a near miss — it is an administrative state, and it
belongs in the drawer, not here.

---

## 16. Previewing employee changes

The employee edit experience uses the backend preview endpoint. The server is
authoritative; the browser never guesses.

```
Employee → Edit → change attributes → Preview → review diff → Save
```

```
Edit Alice Chen

Department      [ Sales                    ▾ ]     was Engineering
State           [ CA                         ]
Role            [ Staff Engineer             ]
Manager         [ 🔍 Dana Reed               ]     was Alice Chen

Effective from  ⦿ Today (Sep 2, 2026)
                ○ [ 2026-08-01 ]  ← requires employee:backdate

                                            [ Preview change ]
────────────────────────────────────────────────────────────────
Preview — nothing has been saved.

+ Sales Commission Policy        Sales Rule · DEPARTMENT · 600
− Engineering Equipment Stipend  Engineering Rule · DEPARTMENT · 600
= Vacation                       unchanged
= CA Meal Break Training         unchanged

⚠ Manager changes are not included in this preview.

                                  [ Cancel ]  [ Save change ]
```

### 16.1 Effective dating is part of the form

`PATCH /employees/:id` accepts an optional `effectiveFrom` that defaults to
today; a **past** date requires `employee:backdate`. v1 omitted this field
entirely, which would have made every correction land on today's date and
silently produce wrong history.

The past-date radio is hidden without the permission. A `BACKDATING_NOT_PERMITTED`
error reaching the UI means the client's permission check was wrong.

The same applies to rule effective windows (§18.5) and group membership
add/remove (§29.4).

### 16.2 Manager is editable but not previewable

`previewEmployeeSchema.changes` accepts `isManager`; `patchEmployeeSchema` accepts
`managerId` and **ignores** `isManager`. These are two different things:

- The form exposes **Manager** — a person picker writing `managerId`.
- The form never exposes an "Is manager" toggle; the save path ignores it.
- A manager change produces **no preview diff**, because preview has no
  `managerId` input. The `⚠` line above says so rather than showing an empty
  diff that implies nothing will change.

### 16.3 Preview's baseline is the engine, not the database

Preview compares *the engine's answer now* against *the engine's answer with the
change*, deliberately — comparing against materialized state would fold any
existing drift into the diff and blame it on the user's edit.

Consequence: if the employee is stale, the preview's `unchanged` list can
disagree with the Policies tab. When the reconciliation backlog is non-zero
(§31.3), the preview panel adds:

```
ⓘ 3 changes are still being applied. This preview reflects the rules
   as they stand now, which may differ from the policies listed above.
```

---

## 17. Rule list

```
Rules                                                       + New rule

[ Search rules…                    ]  [Policy ▾] [Type ▾] [Enabled ▾]

┌──────────────────────────────────────────────────────────────────────┐
│ Rule                   Policy                Type       Pri  Status  │
├──────────────────────────────────────────────────────────────────────┤
│ California Employees   CA Meal Break Tr…    LOCATION    800  Active  │
│ Executive Track        Vacation             ROLE        700  Active  │
│ Contractors            Contractor Training  ROLE        500  Scheduled│
└──────────────────────────────────────────────────────────────────────┘
```

### 17.1 Filters that exist

`policyId`, `ruleType`, `enabled`, `search` (matches `name`), plus pagination.

**Cut from v1:** `[Priority]` and `[Effective date]` filters — neither param
exists.

### 17.2 The Status column is derived; the filter is not

`RuleDTO` carries `enabled`, `effectiveFrom`, `effectiveTo`. Status is computed
client-side against `asOf` (or today):

| Condition | Status |
|---|---|
| `!enabled` | **Inactive** |
| `effectiveFrom > asOf` | **Scheduled** |
| `effectiveTo !== null && effectiveTo <= asOf` | **Expired** |
| otherwise | **Active** |

`effectiveTo` is **exclusive** — a rule with `effectiveTo = 2026-09-02` is not in
effect on September 2.

The filter dropdown offers only **Enabled / Disabled / All**, because `enabled` is
the only thing the API filters on. It is not labelled "Status", to avoid implying
the four derived values are filterable.

### 17.3 The Policy column needs a lookup

`RuleDTO` carries `policyId`, not a name. Fetch `GET /policies?limit=100` once,
cache it in TanStack Query under a long `staleTime`, and resolve names from it.
Policies are few and change rarely. Show the id, truncated, if the lookup fails —
never a blank cell.

### 17.4 Priority in context

A raw integer is less meaningful than an ordering:

```
Priority 800
3rd of 7 rules for Vacation
```

**This ordinal is computed in the browser**, and §50 says never to reproduce
policy evaluation in the browser. The tension is real and resolved as follows:
the ordinal is a *display sort*, never a decision. It uses the engine's exact
comparator, whose inputs are all on `RuleDTO`:

```
priority DESC,
RULE_TYPE_PRIORITY_BANDS[ruleType] DESC,   // imported from @policy/shared
createdAt ASC,
id ASC
```

Because the bands are shared constants rather than a re-implementation, the two
cannot drift. Compute the ordinal **only within a single policy's rule list**
(`GET /rules?policyId=`), never across a category — that would need every policy
in the category and every rule under each.

Consequently v1's "3rd of 7 rules for Vacation" on the *global* rule list is
removed; the ordinal appears on the policy detail page (§27.2) and rule detail
(§22), where the full set is already loaded.

---

## 18. Rule editor

The rule builder should feel like a policy configuration tool, not a programming
language.

```
New rule

Name          [ California Employees              ]
Rule type     [ LOCATION                       ▾  ]   ← cannot be changed later
Policy        [ CA Meal Break Training         ▾  ]

Priority      [ 800 ]     Default for LOCATION is 400.
                          Higher wins. Ties break by rule type, then age.

Effective     from [ 2026-01-01 ]  to [ ─────────── ]  (no end date)

Employees must satisfy ALL of these:

  [ State          ▾][ equals        ▾][ CA               ]  [×]
  [ Employment type ▾][ equals        ▾][ FULL_TIME     ▾ ]  [×]

                                                + Add condition

  ⓘ Values are matched exactly. "California" will not match "CA".

────────────────────────────────────────────────────────────────
Matches 428 of 1,284 employees                [ Preview matches ]

                              [ Cancel ]  [ Create rule ]
```

### 18.1 Name and rule type are required — v1 omitted both

`POST /rules` requires `name` and `ruleType`. `ruleType` is not cosmetic:

- It sets the **default priority band**: MANUAL 1000, ROLE 800, DEPARTMENT 600,
  LOCATION 400, TENURE 300, GROUP 200, DEFAULT 100.
- It is the **tie-break** in resolution when two rules share a priority.
- It is a list filter.
- It **cannot be patched** after creation. The form must say so.
- It **constrains conditions**: a `DEFAULT` rule must have zero clauses.

### 18.2 Two rule types the editor does not create

- **DEFAULT** — selecting it hides the condition builder entirely and shows
  `This rule applies to every employee in the organization.` A DEFAULT rule with
  conditions is a 400.
- **MANUAL** — not offered here at all. Manual overrides are created from the
  employee page (§30), where the employee is in context; `POST /rules` with
  `ruleType: MANUAL` and no employee is `MANUAL_RULE_REQUIRES_EMPLOYEE`.

### 18.3 Condition structure

Every condition is **attribute → operator → value**. Nine attributes:

`department`, `state`, `country`, `location`, `employmentType`, `role`,
`tenureDays`, `isManager`, `groupId`.

Operators are filtered by attribute type — never offer one the evaluator will
reject:

| Attribute kind | Operators |
|---|---|
| Text (`department`, `state`, `country`, `location`, `employmentType`, `role`) | equals, does not equal, is one of, is not one of |
| Numeric (`tenureDays`) | at least, at most, greater than, less than, equals, does not equal |
| Boolean (`isManager`) | equals |
| Group (`groupId`) | is in group, is in any of, is not in group, is not in any of |

Ordered comparison on a group id is rejected server-side and must not be offered.

**Duplicate `(attribute, operator)` pairs are rejected** by the server. The
builder disables an already-used pair in the attribute dropdown rather than
letting the user discover this on save.

### 18.4 Values are free text, and matching is exact

Employee attributes are unconstrained strings; there is no distinct-values
endpoint (§4.3). So the value field is a text input, not a picker — with two
mitigations:

- The persistent note: `Values are matched exactly. "California" will not match "CA".`
- A **typeahead of values already in use**, assembled from the first page of
  `GET /employees?<attribute>=`. It is a convenience, not a constraint: a value
  not in the list is still accepted, because the list is one page of employees,
  not the domain.

Two exceptions, where a real picker exists:

- **`groupId`** — a group picker fed by `GET /groups?search=`. **Never expose a
  UUID.** A group id in a rule must always render as its name.
- **`isManager`** — a Yes/No toggle.

### 18.5 Tenure is entered in years, stored in days

```
Tenure  [ at least ▾ ]  [ 5 ] years        → tenureDays >= 1825
```

Store the engine-compatible representation; display the human one. The conversion
is 365 days per year and both figures are shown wherever tenure appears (§15.3).

### 18.6 Effective dates

`effectiveFrom` is required; `effectiveTo` is optional and **exclusive**. A past
`effectiveFrom` requires `employee:backdate` — the same gate as §16.1. The end
date field is labelled `to (exclusive)` or, better, worded as
`Last day: Dec 30, 2026` beneath a `to = 2026-12-31` value, so the half-open
convention never has to be explained.

### 18.7 There is no "Publish"

Rules have no draft state. `POST /rules` creates the rule live, subject to its
effective window, with `enabled: true` unless specified. v1's "Publish" step in
§44 Journey C and the acceptance criteria described a lifecycle that does not
exist. ("Draft" is a **policy** status, not a rule status.)

The button says **Create rule**. To stage a rule without effect, either set a
future `effectiveFrom` — which the Status column will show as **Scheduled** — or
create it disabled:

```
☐ Create this rule disabled (I'll enable it later)
```

---

## 19. Future-proof rule builder architecture

The backend accepts a flat, AND-only envelope:

```json
{ "version": 1, "all": [] }
```

The frontend should still model conditions internally as a **tree**, so nested
boolean logic can be introduced later without replacing the component.

```
Current UI                Future UI
ALL                       ALL
 ├── condition             ├── condition
 ├── condition             └── ANY
 └── condition                  ├── condition
                                └── condition
```

But: **do not show AND/OR nesting controls until the backend supports them.** The
serializer targets `version: 1` and refuses to emit anything the current envelope
cannot express. When a v2 envelope arrives, the editor state survives and only
the serializer and the controls change.

---

## 20. Rule simulation

The editor answers "who will this rule affect?" **before** the rule is created,
via `POST /rules/simulate`.

The request body is **`ruleType` and `conditions` only** (plus an optional `asOf`
and paging) — not the whole rule. Simulate answers *"which employees match these
conditions?"*, which is exactly the question the editor is asking, and it needs
neither the policy nor the priority to answer it. Two consequences worth stating
plainly: the same conditions simulate identically no matter which policy they are
attached to, and **simulate says nothing about whether a matching employee would
actually receive the policy** — that depends on priority, cardinality and
whatever else matches them.

```
Matches 428 of 1,284 employees                   [ Preview matches ]

  Alice Chen      Engineering   CA    ✓
  Maya Singh      Engineering   CA    ✓
  Ben Carter      Sales         NY    ✕  state equals CA — Ben: NY
                                        … 425 more
```

`MatchingEmployeeDTO` carries `matched`, `reason`, `matchedClauses` and
`failedClause` per employee, so non-matching rows can show *why* they did not
match — the same explanatory pattern as §14, at population scale.

### 20.1 The cost, and how the UI respects it

Simulate is **EXPENSIVE-tier: 5 burst, 20 per minute, keyed by organization** —
shared across every admin in the tenant. It also sweeps every active employee, so
its cost scales with headcount regardless of how narrow the rule is.

Therefore:

- Simulation is **never** run on keystroke or on blur. It runs on an explicit
  **Preview matches** click.
- The result is cached against a hash of the rule body; re-clicking without an
  edit re-renders the cache.
- On 429, §40.5's countdown is shown inline in the panel — not as a toast — and
  the button is disabled until `Retry-After` elapses.

The same applies to `GET /rules/:id/matching-employees` (§22) and
`POST /employees/:id/preview` (§16).

---

## 21. Rule impact before save

When an existing rule changes, show the impact before committing, by calling
`POST /rules/simulate` twice — once with the saved conditions and once with the
edited ones — and diffing the two populations. Never client-side inference.

Both calls are EXPENSIVE-tier, so the "before" result is taken from the cache
populated when the editor opened, not re-fetched on save.

```
Rule changes

BEFORE                          AFTER
state = CA                      state = CA
                                department = Engineering

────────────────────────────────────────────────────────
Potential impact

428 → 96 matching employees
332 employees would no longer match

[ View affected employees ]          [ Cancel ]  [ Save rule ]
```

"Would no longer match" is a population delta, not an assignment delta: whether
those 332 employees actually lose the policy depends on what else matches them,
and on their being reconciled. The confirmation copy in §41.1 says so.

---

## 22. Rule detail

```
← Rules

California Employees                            [ Edit ]  [ ⋯ ]
LOCATION · Active

Policy         CA Meal Break Training               →
Priority       800 · 1st of 4 rules for this policy
Effective      Jan 1, 2026 → no end date
Version        v3 · updated Sep 2, 2026

Conditions
──────────────────────────────────────────
state equals CA
employmentType equals FULL_TIME

Matching employees                     as of Sep 2, 2026
──────────────────────────────────────────
[ Load matching employees ]     ← EXPENSIVE; explicit, never automatic

Version history                                     [ View all ]
──────────────────────────────────────────
v3   Sep 2, 2026    Added employment type condition
v2   Jun 12, 2026   Priority 500 → 800
v1   Jan 1, 2026    Created
```

The `⋯` menu holds Enable / Disable / Retire (§24).

The priority ordinal is computed here from `GET /rules?policyId=` — the full set
for this policy, already needed for the policy detail page (§17.4).

---

## 23. Rule version history

Version history is a first-class inspection surface, backed by
`GET /rules/:id/versions`.

```
v2 → v3                                                    Sep 2, 2026

Priority        500 → 800

Conditions      state equals CA                    unchanged
              + employmentType equals FULL_TIME    added

Effective       Jan 1, 2026 →                      unchanged
```

The diff is computed in the browser from two `RuleVersionDTO` snapshots. This is
a text comparison of stored rule bodies, not an evaluation, so §50 is not
violated.

**Historical explanations link here.** The drawer's
`Assigned by Rule v3. The current rule is v4.` banner links to the `v3 → v4` diff,
which is the fastest available answer to "what changed since this assignment was
made?".

---

## 24. Rule lifecycle actions

Three endpoints exist and v1 specified none of them.

| Action | Endpoint | UI |
|---|---|---|
| Enable | `POST /rules/:id/enable` | Menu item; confirmation shows the population it will start matching |
| Disable | `POST /rules/:id/disable` | Menu item; §41.1's consequence confirmation |
| Retire | `DELETE /rules/:id` | Menu item, **labelled "Retire"** |
| Change priority | `PATCH /rules/:id/priority` | Inline on rule detail; creates a new version |

**`DELETE` is a soft delete**: the rule is disabled and end-dated today, and its
versions and the assignments it produced survive. Calling it "Delete" would
promise an erasure that does not happen and would frighten users away from a safe
action. The confirmation states the mechanics:

```
Retire "California Employees"?

The rule will be disabled and end-dated today (Sep 2, 2026).
Its history and past assignments are preserved.
428 employees currently match it.

Assignments are not removed until each employee is reconciled.

                              [ Cancel ]  [ Retire rule ]
```

---

## 25. Policy categories

Categories were absent from v1, yet every policy requires one and a category
carries the **cardinality** that governs the whole conflict-resolution model.

Managed under Settings (`/settings/categories`) rather than in the main nav —
they are configured once and rarely revisited.

```
Policy categories                                    + New category

Name              Key                   Cardinality   Policies
Time Off          time_off              SINGLE        4
Compliance        compliance            MULTIPLE      6
Application       application_access    MULTIPLE      9      ← reserved
Pay Schedule      pay_schedule          SINGLE        4
```

### 25.1 Creating one

```
New category

Name          [ Benefits          ]
Key           [ benefits          ]   Used in URLs and integrations.

Cardinality   ⦿ SINGLE    An employee can have one policy in this category.
              ○ MULTIPLE  An employee can have several at once.

⚠ Cardinality cannot be changed after the category is created.
   Existing assignments would violate the new constraint.

                              [ Cancel ]  [ Create category ]
```

The warning is not decorative — cardinality is immutable server-side, and the
constraint is enforced by a partial unique index.

### 25.2 The reserved category

The category with key `application_access` backs the `/access` endpoints (§28).
The UI marks it reserved and does not offer to delete it.

---

## 26. Policy list

Policies are configuration objects, not the decision engine.

```
Policies                                              + New policy

[ Search policies…          ]  [Category ▾]  [Status ▾]

┌────────────────────────────────────────────────────────────────┐
│ Policy                      Category        Cardinality Status │
├────────────────────────────────────────────────────────────────┤
│ CA Meal Break Training      Compliance      MULTIPLE    Active │
│ Engineering Stipend         Benefits        MULTIPLE    Active │
│ Vacation                    Time Off        SINGLE      Active │
│ Legacy Commuter Benefit     Benefits        MULTIPLE    Archived│
└────────────────────────────────────────────────────────────────┘
```

Filters: `categoryId`, `status` (DRAFT / ACTIVE / ARCHIVED), `search` (name).

### 26.1 The counts are gone

v1 showed **Rules** and **Employees** counts per row. Neither is available in one
request: rule counts need `GET /rules?policyId=&limit=1` per row, and assignment
counts need `GET /policies/:id/assignments?limit=1` per row — both N+1, the second
against the EXPENSIVE budget.

v1's own §18 said *"counts should only be displayed when the backend can provide
them efficiently"*, then displayed two that it cannot. The columns are removed;
both counts appear on policy detail, where one request each is proportionate.

---

## 27. Policy detail

```
← Policies

CA Meal Break Training                              [ Edit ]  [ ⋯ ]
Compliance · MULTIPLE · Active

  ⓘ MULTIPLE — employees can hold several Compliance policies at once.
     Rules do not compete; each matching rule assigns independently.

Rules                                                  + Add rule
──────────────────────────────────────────────────────────────────
1.  California Employees      LOCATION    800    Active
2.  Contractor Rule           ROLE        500    Active
3.  Everyone                  DEFAULT     100    Inactive

Assigned employees                          as of Sep 2, 2026
──────────────────────────────────────────────────────────────────
428 employees                                    [ View all → ]
```

### 27.1 The rule list here is ordered

`GET /rules?policyId=` returns every rule for this policy, so the engine ordering
(§17.4) can be applied honestly. This is where "1st of 4" is meaningful.

### 27.2 The order means different things per cardinality

- **SINGLE** — the order is a precedence ladder. Rule 1 wins; the rest are
  fallbacks. State that explicitly: `Highest-priority matching rule wins.`
- **MULTIPLE** — the order is only a tie-break for the *same policy* claimed
  twice. State: `Rules do not compete; each matching rule assigns independently.`

Never render a MULTIPLE category's rules as a ladder with a crown on the first.

### 27.3 Assigned employees

`GET /policies/:id/assignments?asOf=` — new (§4.2). `PolicyAssignmentDTO` carries
`employeeName` and `employeeEmail`, so the list needs no per-row lookup.

```
← CA Meal Break Training

Employees assigned                             as of Sep 2, 2026
428 assignments

┌──────────────────────────────────────────────────────────────────┐
│ Employee          Source rule            Effective        Why?   │
├──────────────────────────────────────────────────────────────────┤
│ Alice Chen        California Employees   Jan 1, 2026 →    Why?   │
│ Maya Singh        California Employees   Jan 1, 2026 →    Why?   │
│ Raj Patel         ⚑ Manual override      Jun 1 → Dec 31   Why?   │
└──────────────────────────────────────────────────────────────────┘
```

`resolutionStatus` distinguishes `AUTOMATIC` from `MANUAL_OVERRIDE`, so overrides
carry the same ⚑ flag they do everywhere else (§30).

### 27.4 This screen is 403 for two roles

The route refuses **both** self-scoped (`EMPLOYEE`) and subtree-scoped
(`MANAGER`) roles. A manager's reporting line is not expressible as a policy-side
filter, so a partially-filtered list would silently under-report — the endpoint
refuses rather than misleading. Neither role reaches this screen in this MVP
(§2.1) but the constraint is recorded here for when they do.

---

## 28. Application access

CLAUDE.md lists application access as a core policy area, and the backend has
dedicated endpoints for it. v1 did not mention it.

**Decision: access is not a separate screen in this MVP.** Applications are
policies in the `application_access` category, and they appear in the ordinary
policy surfaces — an employee's GitHub access is a row on their Policies tab with
a `Why?` like any other.

`GET /access?asOf=` is used only where a compact list is wanted:

```
Application access                              as of Sep 2, 2026

  GitHub      Engineering Rule        ⚑
  Slack       Everyone (DEFAULT)
  Jira        Engineering Rule
```

`PUT`/`PATCH /access` (both `assignment:override`) are the grant/revoke path and
are **not** exposed in this MVP: granting access outside a rule is an override,
and §30's override flow already covers it with better explanation. Revisit when
there is an IT-admin persona.

---

## 29. Groups

```
Groups                                                  + New group

[ Search groups…            ]

Engineering        Created Mar 2023
Managers           Created Jan 2026
Remote             Created Jun 2024
```

### 29.1 No member count in the list

`GroupDTO` carries no count; obtaining one is `GET /groups/:id/members?limit=1`
per row. v1 showed "142 members" per row — an N+1. The count appears on the group
detail page, where it is one request.

### 29.2 Group detail

```
← Groups

Engineering                                       [ Edit ]  [ ⋯ ]
142 members as of Sep 2, 2026

Members                                        [ + Add member ]
──────────────────────────────────────────────────────────────
Alice Chen        alice@acme.com    Joined Mar 14, 2023      [ Remove ]
Maya Singh        maya@acme.com     Joined Jan 8, 2024       [ Remove ]

                                        25 of 142   ‹ 1 2 … 6 ›

Rules using this group                                    3
──────────────────────────────────────────────────────────────
Engineering Equipment      → Engineering Equipment Stipend
Engineering Vacation       → Vacation
```

### 29.3 "Rules using this group", not "Policies affected"

v1's "Policies affected" had no defined derivation. The honest computation:
fetch `GET /rules?limit=100`, scan each rule's `conditions.all` for a clause with
`attribute === "groupId"` whose value contains this group's id.

Note that `ruleType` is **not** a proxy for this — a `DEPARTMENT` rule may
perfectly well carry a `groupId` clause. The scan is over conditions, not types.

This is bounded (rules are few) and cached. If the org exceeds one page of rules,
the section shows `Not available for organizations with more than 100 rules` and
links to the rule list. It never silently shows a partial answer.

### 29.4 Membership changes are effective-dated and gated

`POST /groups/:id/members` takes `effectiveFrom`; the removal takes
`effectiveTo`. Both sit behind `requireBackdatePermission`. v1's dialogs showed
neither.

```
Add Alice Chen to Engineering

Effective from   ⦿ Today (Sep 2, 2026)
                 ○ [ 2026-08-01 ]   ← requires employee:backdate

This may change Alice's policy assignments.
Changes are applied when Alice is next reconciled.

                              [ Cancel ]  [ Add to group ]
```

The consequence line is deliberately vague about *which* policies: there is no
group-membership preview endpoint, and `POST /employees/:id/preview` takes a
`groupIds` argument that **replaces the whole membership set** rather than adding
to it. Rather than construct a fragile full-set preview, the dialog states that
assignments may change and leaves the precise answer to reconciliation.

### 29.5 Deleted groups

Groups are soft-deleted, and every group read filters them out — so a deleted
group is a **404 on every read, including historical ones**. A rule that
references it, or a January view of a group deleted in March, cannot resolve a
name.

```
Group 8f3c2a1e…  (deleted)
This group no longer exists. Rules referencing it will not match any employee.
```

Never render a bare UUID. Never let the failed lookup blank the row.

---

## 30. Manual overrides

Overrides must be visually distinct from automatic assignments — this is what
makes "why did reconciliation not change this?" answerable.

### 30.1 Display

```
Vacation — Executive                          Time Off · SINGLE

⚑ Manual override
   Created by Pratham on Jun 1, 2026
   Effective Jun 1 → Dec 31, 2026
   Priority 1000

                        [ Why? ]  [ Revoke override ]
```

The ⚑ flag comes from `resolutionStatus === "MANUAL_OVERRIDE"` and appears
everywhere an assignment is listed: the employee Policies tab, the policy's
assigned-employee list, and the drawer.

### 30.2 Creating one

`POST /employees/:id/overrides` — `policyId` and `effectiveFrom` required,
`name` and `priority` optional. Gated on `assignment:override`.

```
Add manual override for Alice Chen

Policy        [ Vacation — Executive           ▾ ]
Effective     from [ 2026-06-01 ]  to [ 2026-12-31 ]  (optional)
Priority      [ 1000 ]   Default for a manual override.

⚠ An override does not always win.
   Priority 1000 ties with any other rule set to 1000, and a
   DEPARTMENT rule at 1000 would beat this override at 999.
   Check the result in Why? after saving.

                              [ Cancel ]  [ Create override ]
```

### 30.3 The caveat is not optional copy

An override is a `MANUAL` rule like any other, resolved by the same comparator.
Its default priority of 1000 is the top **band**, not an escape hatch: at equal
priority, the band breaks the tie — and any rule an admin has typed 1000 into
sits at the same number. The "Manual override" badge appears only when the
override actually **won**.

Telling users an override always wins would produce exactly the confused support
ticket this product exists to prevent.

### 30.4 Revoking

`DELETE /overrides/:id`.

```
Revoke this override?

Alice will fall back to whichever rule matches her next.
Based on today's rules, that is: Standard Vacation (priority 100).

Her assignment changes when she is next reconciled.

                              [ Cancel ]  [ Revoke override ]
```

The fallback line is computed with `POST /employees/:id/preview` — the same
server-authoritative path as §16, not a guess.

---

## 31. Reconciliation UX

Do not build a fake progress dashboard. There is no run entity, no campaign, no
percentage. There are three real things: a synchronous per-employee action, an
asynchronous backlog, and a failure list.

### 31.1 The two paths, which behave differently

| | Manual reconcile | Automatic |
|---|---|---|
| Trigger | `POST /reconciliation/employees/:id` | Any write that affects assignments |
| Timing | **Synchronous** — the response *is* the result | Outbox row → relay → worker |
| Feedback | Immediate `+ / − / =` counts | Backlog count; no per-employee signal |
| Failure | An HTTP error on the request | An outbox row with `status = FAILED` |

v1 described the manual path as *"Reconciliation queued… Status: Reconciling…"*.
It is not queued. It runs in the request and returns
`ReconciliationResultDTO { added, removed, unchanged }`.

### 31.2 Manual reconcile

```
[ Reconcile now ]  →  [ Reconciling… ]  →

  ┌────────────────────────────────────────────┐
  │ Reconciled                                 │
  │                                            │
  │ + 1  CA Meal Break Training                │
  │ − 0                                        │
  │ = 4  unchanged                             │
  └────────────────────────────────────────────┘
```

The result is rendered inline above the Policies table, which is refetched at the
same time. No toast — the counts are the point, and a toast would dismiss them.

This call is EXPENSIVE-tier; §40.5 applies. It is a 409 for a terminated
employee, which is why §12.3 hides the button.

### 31.3 The backlog indicator

`GET /reconciliation/status` returns per-status counts and `oldestPendingAt`.

**This is an organization-level backlog, not a per-employee state.** It says "3
changes are still being applied somewhere in the org", never "Alice is stale".
Nothing in the API can say the latter, and v1's per-employee Stale badge is
removed for that reason.

In the header:

| Condition | Display |
|---|---|
| `counts.PENDING + counts.PROCESSING === 0` and no failures | *nothing* |
| pending > 0, `oldestPendingAt` under 5 minutes | `⟳ 3 pending` (grey) |
| pending > 0, `oldestPendingAt` over 5 minutes | `⟳ 3 pending · oldest 12m` (amber) |
| `counts.FAILED > 0` | `⚠ 2 failed` (red) → links to §31.5 |

Polled at 30 s while the tab is focused, paused when it is not. Never a spinner —
a backlog is a number, not an activity.

### 31.4 What is deliberately not built

No org-wide "Reconcile everyone" button (no endpoint). No progress bar (no
denominator). No per-employee reconciling state (no signal). If those endpoints
arrive later, §47's deferred list is where the screen gets specified.

### 31.5 Reconciliation events

`GET /reconciliation/events` at `/settings/reconciliation` — a diagnostic
surface, not a daily one. Gated on `assignment:reconcile`.

```
Reconciliation events

[Status: Failed ▾]  [Type ▾]

Status    Event                  Aggregate      Attempts  Created
FAILED    employee.updated       employee 8f3c…    5      Sep 2, 09:41
FAILED    rule.updated           rule a91b…        5      Sep 2, 09:38
PENDING   group.deleted          group 4c2d…       0      Sep 2, 09:44
```

A `FAILED` row means the relay exhausted its retries. There is **no retry
endpoint** — so there is no `[Retry]` button here, and v1's was removed. What the
UI can offer is the workaround that does exist:

```
This change was not applied automatically.
Reconcile the affected employee directly.       [ Open employee → ]
```

For a `rule.*` or `group.*` aggregate, which fans out to many employees, no
single-employee link is meaningful; the row links to the rule or group instead.

---

## 32. Audit

Audit answers: **who changed what, when.**

```
Audit log

[ Search actions…        ]  [Entity type ▾]  [Actor ▾]  [From]  [To]

Sep 2, 2026 · 09:42:11
Pratham Raj changed rule                      rule.priority_changed
California Employees · priority 500 → 800

Sep 2, 2026 · 09:44:03
System reconciled Alice Chen                  reconciliation.ran
```

### 32.1 What `search` actually searches

`search` matches `action` **or** `entityType` — the only text columns on an audit
row. It is **not** a free-text search over actors, entity names or metadata.

The placeholder therefore says `Search actions…`, not `Search audit…`, and the
help text names the fields:

```
Searches the event type (e.g. "rule.priority_changed") and the entity kind.
To find events for a specific record, open that record's own history.
```

There is no `action` filter dropdown (v1 had one); `search` is how you narrow by
action.

### 32.2 One line from v1 is removed

`System reconciled 428 affected employees` is an event that is never written.
`reconciliation.ran` is per employee, and the worker's rule fan-out writes no
aggregate audit row at all. It is listed as a gap in §4.3.

### 32.3 Actor names need a lookup

`AuditEventDTO` carries `actorId` only. Collect the distinct actor ids on the
page, resolve them in one `GET /user?limit=100`, cache for the session. Fall back
to the truncated id — never a blank.

### 32.4 Timestamps are not effective dates

Audit events carry `TIMESTAMPTZ` and are shown to the second in the viewer's
timezone. Assignment and rule effective periods are `DATE` and are shown as days,
never with a time. The two must never share a formatter or a column.

---

## 33. Command palette

`⌘K` / `Ctrl+K`. Real product actions, not just navigation.

```
Search employees, rules, policies…

  ALICE CHEN
    Open employee
    Explain a policy…
    Preview a change
    Reconcile Alice Chen

  GO TO
    Employees · Rules · Policies · Groups · Audit · Settings

  RECENT
    California Employees rule
    CA Meal Break Training
```

Context-aware: on an employee page the employee's actions come first. On a rule
page: Edit rule, Preview matches, View versions.

The palette's search hits `GET /employees?search=`, `GET /rules?search=` and
`GET /policies?search=` — all three now exist (§4.2) — debounced at 300 ms,
limit 5 each, cancelled on the next keystroke. Groups are included via
`GET /groups?search=`.

`Reconcile` and `Preview` are EXPENSIVE-tier; the palette **navigates to** the
control rather than firing the call, so an accidental Enter cannot spend the
organization's burst budget.

---

## 34. Search, filtering and URL state

Every meaningful filter lives in the URL.

```
/employees?department=Engineering&state=CA&status=ACTIVE&page=2
/employees/8f3c…?asOf=2026-01-01&tab=policies
/rules?policyId=a91b…&enabled=true&search=california
```

Benefits: browser navigation works, filtered views are shareable in a support
thread, a refresh does not destroy state.

**Do not duplicate URL state in a global store.** The router is the source of
truth; TanStack Query keys derive from it.

Conventions:

- `asOf` omitted when it is today.
- `page` omitted when it is 1.
- Empty filters omitted entirely — no `?department=`.
- `?group=` from v1 is gone; the API has no such filter (§11.2).

---

## 35. Data fetching and state

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui ·
TanStack Query · TanStack Table · React Hook Form · Zod.

Do not add Zustand initially.

| Concern | Owner |
|---|---|
| Server state | TanStack Query |
| URL / filter state | Next.js router and search params |
| Form state | React Hook Form |
| Client-side validation | Zod, schemas declared in the frontend (§36.2) |
| Component state | React |

### 35.1 Query key conventions

Every key carries `asOf`, so historical and current views cache independently and
switching the date never shows stale data from the other:

```ts
["employees", { filters, page }]
["employee", id]
["employee", id, "assignments", asOf]
["employee", id, "groups", asOf]
["assignment", id, "explanation"]
["policy", id, "assignments", asOf, page]
["reconciliation", "status"]
```

### 35.2 Tier-aware defaults

| Tier | `staleTime` | Refetch on focus |
|---|---|---|
| READ (lists, details) | 30 s | yes |
| Reference data (policies, categories, groups for pickers) | 5 min | no |
| EXPENSIVE (preview, simulate, matching, reconcile) | ∞ — cached until invalidated | **never** |
| `reconciliation/status` | 30 s poll while focused | yes |

EXPENSIVE queries are never refetched automatically. Losing that rule is how one
open tab quietly drains an organization-wide budget of 5.

### 35.3 Invalidation

After a write, invalidate by entity rather than clearing everything:

- Employee edit → `["employee", id]` and everything beneath it, plus
  `["reconciliation", "status"]`.
- Rule write → `["rules"]`, `["rule", id]`, `["reconciliation", "status"]`.
- Reconcile → that employee's assignment keys, plus the status key.

---

## 36. Monorepo integration

The frontend becomes an npm workspace.

```json
{
  "workspaces": ["apps/api", "apps/worker", "apps/dashboard-panel", "packages/*"]
}
```

### 36.1 What is shared

From `@policy/shared`:

- **DTO types** — `EmployeeDTO`, `AssignmentDTO`, `AssignmentExplanationDTO`,
  `ResolutionTrailEntryDTO`, `PolicyAssignmentDTO`, `EmployeeGroupMembershipDTO`,
  `ReconciliationStatusDTO`, and the rest.
- **Condition types and constants** — `ConditionClause`, `ConditionAttribute`,
  `AttributeValues`, `NUMERIC_ATTRIBUTES`, `RULE_CONDITIONS_VERSION`.
- **Enums** — `RULE_TYPES`, `POLICY_STATUSES`, `RESOLUTION_DECISIONS`,
  `OUTBOX_STATUSES`, `EMPLOYEE_STATUSES`, cardinality, roles.
- **Constants** — `RULE_TYPE_PRIORITY_BANDS` (§17.4), `DEFAULT_PAGE_SIZE`,
  `MAX_PAGE_SIZE`.
- **Permissions** — `PERMISSIONS`, `ROLE_PERMISSIONS`, the scoped-role sets (§10.1).
- **Rate-limit tiers** — for the client's backoff logic (§40.5).
- **Error codes** — `ERROR_CODES`, so error handling switches on a constant.

Never hand-duplicate a backend domain type in the frontend.

### 36.2 What is **not** shared: validation schemas

**Decision (design-review §6, Q6): Zod stays in `apps/api`.**

`@policy/shared` has no `zod` dependency, and the API's validators live in
`apps/api/src/validators`. The frontend cannot import them without depending on
the API application. v1 claimed `@policy/shared` provided "validation schemas";
it does not.

Consequence: **the frontend declares its own Zod schemas for forms.** They will
duplicate server rules — max lengths, required fields, effective-range checks —
and can drift. Two mitigations:

- Frontend schemas are built from shared **types and enums**, so a changed enum
  is a compile error rather than a runtime surprise.
- The server is the authority. A client schema that is wrong produces a
  server-rejected save, not bad data (§40.2).

---

## 37. Frontend architecture

Feature-based organization.

```
apps/dashboard-panel/
  app/
    (auth)/         login/  signup/
    (app)/
      employees/    rules/  policies/  groups/  audit/  settings/
    unavailable/

  components/
    ui/            layout/       data-table/
    command-menu/  explanation/  conditions/  effective-date/

  features/
    employees/     { api, components, hooks, schemas, types }
    rules/         { api, components, hooks, schemas, types }
    policies/      { api, components, hooks, schemas, types }
    groups/  audit/  reconciliation/

  lib/
    api/           client, interceptors, error mapping
    auth/          token storage, session context
    permissions/   ROLE_PERMISSIONS wrapper
    query/         TanStack Query config, tier-aware defaults
    dates/         asOf handling, day-granular formatters
```

Domain behavior lives inside its feature. Generic primitives live in
`components/ui`.

Three shared components earn their place in `components/` because they appear in
several features and must behave identically in each:

- **`explanation/`** — the drawer (§14), opened from employees and policies.
- **`conditions/`** — condition rendering, used by the rule editor, rule detail,
  the drawer and the near-miss card. One renderer means `state equals CA` is
  worded identically everywhere.
- **`effective-date/`** — the from/to control with its back-dating permission
  gate, used by employee edit, rule editor, group membership and overrides.

---

## 38. Design system

The visual language should read as serious infrastructure software adapted for HR
operators — closer to Stripe, Linear or Ramp than to an HR marketing site.

v1 described this in adjectives. Here are the values.

### 38.1 Type scale

System stack: `ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif`.
Tabular numerals (`font-variant-numeric: tabular-nums`) on every numeric column,
priority, count and date.

| Token | Size / line | Use |
|---|---|---|
| `text-xs` | 12 / 16 | Table metadata, timestamps, help text |
| `text-sm` | 13 / 20 | **Body default** — tables, forms, most UI |
| `text-base` | 14 / 20 | Drawer body, dialog copy |
| `text-lg` | 16 / 24 | Section headings |
| `text-xl` | 20 / 28 | Page titles |
| `text-2xl` | 24 / 32 | Employee name on detail |

Mono (`ui-monospace, "SF Mono", Menlo`) for ids, condition expressions and
`action` values.

### 38.2 Spacing

4 px base: 4, 8, 12, 16, 24, 32, 48.
Table cell padding `8px 12px`. Card padding 16. Page gutter 24 desktop, 16 mobile.
Section gap 32.

### 38.3 Radius, border, elevation

Radius 6 px for controls and cards, 8 px for dialogs and drawers, 4 px for badges.
Full only on avatars.

Borders carry the hierarchy: `1px solid var(--border)`, `--border` at ~8% ink.

Three shadows and no more: `sm` for a resting card, `md` for popovers and
dropdowns, `lg` for dialogs and drawers. No shadow on a table row, ever.

### 38.4 Color tokens

Semantic names only. Never a raw hex in a component.

```
--bg              page background        white / near-black
--surface         cards, table headers
--border          1px separators
--ink             primary text
--ink-muted       secondary text
--ink-subtle      metadata, placeholders
--accent          primary action, links, focus ring
```

Status tokens, each with a `-bg` companion for badge fills:

```
--status-success   assignments added, matched conditions, WON
--status-warning   scheduled, pending backlog, LOST / NOT APPLIED
--status-danger    failed, removed assignments, revoke, terminate
--status-neutral   inactive, expired, skipped, no match
--status-info      manual override, preview, historical mode
```

Every status token pairs with a text label and an icon or glyph. Color is never
the only signal (§42).

### 38.5 Density

Table row height 40 px, header 36. Buttons 32 (sm) / 36 (default). Inputs 36.
Badges 20. Icons 16 in tables, 20 in navigation.

### 38.6 Icons

One set: **Lucide** (ships with shadcn/ui). 16 px in dense contexts, 20 in nav,
`1.5` stroke. No emoji in the product chrome; the ⚑ override flag is a Lucide
`flag` glyph, not a character.

### 38.7 Motion

150 ms ease-out for hover and focus, 200 ms for drawer and dialog entry, none for
content that has loaded. All of it inside `prefers-reduced-motion`. No skeleton
shimmer animation — a static tinted block is enough.

### 38.8 Avoid

Giant KPI cards · gradient backgrounds · ornamental animation · AI sparkle icons ·
charts without operational value · fake real-time states · success toasts that
hide a consequence · excessive rounding.

---

## 39. Status semantics

Every status in the product, what produces it, and where it can appear. A status
not on this list should not exist in the UI.

| Status | Applies to | Derivation |
|---|---|---|
| **Active** | Rule | `enabled && effectiveFrom <= asOf && (effectiveTo === null \|\| effectiveTo > asOf)` |
| **Scheduled** | Rule | `enabled && effectiveFrom > asOf` |
| **Expired** | Rule | `effectiveTo !== null && effectiveTo <= asOf` |
| **Inactive** | Rule | `!enabled` |
| **Draft** / **Active** / **Archived** | **Policy** | `PolicyDTO.status` |
| **Active** / **Terminated** | Employee | `EmployeeDTO.status` |
| **Manual override** | Assignment | `resolutionStatus === "MANUAL_OVERRIDE"` |
| **Pending** / **Failed** | Reconciliation backlog, **org-wide** | `ReconciliationStatusDTO.counts` |
| **WON / LOST / NOT APPLIED / NO MATCH / SKIPPED** | Trail entry | §14.4 |

### 39.1 Four v1 statuses removed

- **Assigned** — not a backend state. Every assignment row returned is in effect;
  the column carried no information (§13.1).
- **Overridden** — the enum value is `MANUAL_OVERRIDE` and the product term is
  *manual override* (CLAUDE.md). One name, used everywhere.
- **Stale** — nothing per-employee produces it (§31.3).
- **Reconciling** — the manual path is synchronous and the async path has no
  per-employee signal (§31.1).

### 39.2 "Draft" belongs to policies only

A rule has no draft state (§18.7). Applying the word to rules was v1's most
misleading piece of terminology, because it implied an unpublished-changes
lifecycle that does not exist.

---

## 40. Loading, empty and error states

### 40.1 Loading

Skeletons for page-level data, matching the real layout's row heights so nothing
shifts. Inline spinners inside buttons for mutations. No full-screen spinner for
anything smaller than a route change.

The explanation drawer opens **immediately** with the assignment header — which
the caller already has — and loads its trail underneath. The user should never
watch an empty panel.

### 40.2 Errors — the shape the API actually returns

`ApiFailure` is `{ success: false, message, code }`. Zod issues are **joined into
one `message` string**; there is no per-field error map.

Therefore: **server validation errors render as a form-level banner**, never as
field-level messages. Field-level errors come from the client's own Zod schema
(§36.2), which is why replicating server rules in the client is worth the
duplication.

```
┌────────────────────────────────────────────────────────────┐
│ ⚠ Could not save this rule                                 │
│   effectiveTo must be after effectiveFrom;                 │
│   priority must be at most 1000                            │
└────────────────────────────────────────────────────────────┘
```

### 40.3 Error codes → UI

| Code | Response |
|---|---|
| `UNAUTHENTICATED`, `SESSION_EXPIRED`, `SESSION_REVOKED` | Clear token → `/login?next=` (§9.3) |
| `FORBIDDEN`, `INSUFFICIENT_PERMISSIONS` | Forbidden state; log — the client should not have shown the control |
| `NOT_FOUND` | Route-level not-found with a link back to the list |
| `VALIDATION_FAILED` | Form banner (§40.2) |
| `ALREADY_EXISTS` | Inline on the field that collides (name, email, key) |
| `CARDINALITY_VIOLATION` | Explain: this category allows one policy per employee |
| `INVALID_EFFECTIVE_RANGE` | Inline on the date fields |
| `BACKDATING_NOT_PERMITTED` | "You do not have permission to record past-dated changes" |
| `MANAGER_CYCLE`, `INVALID_MANAGER` | Inline on the manager picker |
| `RATE_LIMIT_EXCEEDED` | §40.5 |
| `CONFLICT` | Contextual — e.g. reconciling a terminated employee |
| `INTERNAL_ERROR` | Generic, with a retry and the request context preserved |

Never render a bare `Something went wrong.`

### 40.4 The conflict v1 invented

v1's example error read *"another version was published after you opened this
page"*. `PATCH /rules/:id` has no expected-version field and unconditionally
bumps the version — **last write wins, and no 409 is ever raised.** The example is
replaced by errors the API does raise (§40.3).

If optimistic concurrency is wanted, it is a backend change (§4.3), not a client
one.

### 40.5 429 and `Retry-After`

Handled in the **API client, Phase 1** — not in Phase 8. EXPENSIVE-tier calls
ship in Phases 3, 5 and 6, and the budget is 5 burst / 20 per minute **per
organization**. One admin tuning a rule will hit it inside a minute.

```
┌────────────────────────────────────────────────────────────┐
│ ⏳ Too many previews right now                             │
│    This limit is shared across your organization.          │
│    Try again in 12s.                          [ Retry ]    │
└────────────────────────────────────────────────────────────┘
```

Rendered **inline in the panel that triggered it**, not as a toast, so the user's
unsaved work stays visible. The client never auto-retries an EXPENSIVE call — a
retry storm against an organization-wide budget harms every other admin.

### 40.6 Empty states name the next action

| Where | Copy | Action |
|---|---|---|
| No rules for a policy | "No assignment rules yet. Create a rule to determine which employees receive this policy." | `[ Create rule ]` |
| Filtered employee list | "No employees match these filters." | `[ Clear filters ]` |
| No assignments | "No policies apply to Alice on this date." | `[ Reconcile now ]` |
| Empty near-miss | Section hidden entirely | — |
| No audit events | "No changes recorded in this range." | `[ Widen the range ]` |
| Empty reconciliation events | "Nothing pending. All changes have been applied." | — |

---

## 41. Destructive and assignment-affecting actions

Never `Are you sure?` when the backend can compute the consequence.

### 41.1 With a consequence

```
Disable "California Employees"?

428 employees currently match this rule.

Assignments potentially removed:
  • CA Meal Break Training — 428 employees

Assignments are not removed immediately. Each employee's policies
change when they are next reconciled.

                            [ Cancel ]  [ Disable rule ]
```

The population comes from `GET /rules/:id/matching-employees`. The second
paragraph is required: the count is a *population*, and the actual assignment
change happens at reconciliation.

### 41.2 Which actions get one

Rule disable / retire / priority change · employee attribute edit (§16) ·
employee terminate (§12.2) · group membership add / remove (§29.4) · override
create / revoke (§30) · policy archive (§41.3).

### 41.3 Policy archive — the one action with no consequence to compute

**No write in `PolicyService` enqueues reconciliation.** Archiving a policy makes
its rules skip at the *next* evaluation, but existing assignments persist until
something else reconciles those employees. There is no fan-out.

The confirmation must not pretend otherwise:

```
Archive "Legacy Commuter Benefit"?

Its rules stop matching new evaluations.

⚠ Existing assignments are NOT removed. 183 employees keep this
   policy until each is reconciled individually.

                            [ Cancel ]  [ Archive policy ]
```

This is the most important honesty case in the document: a user who believes
archiving revokes a benefit, when it does not, has made a compliance error the UI
invited.

---

## 42. Accessibility

- Full keyboard navigation; visible focus everywhere; a logical tab order.
- Semantic buttons and controls — never a clickable `div`.
- Drawers and dialogs: focus trapped, focus restored on close, `Esc` closes,
  labelled by their heading.
- Tables: real `<table>` semantics, `<th scope>`, a caption or `aria-label`.
- Contrast at least 4.5:1 for text, 3:1 for UI boundaries.
- **Status is never color alone.** Every badge carries a text label; the trail's
  ✓ / ✕ glyphs are accompanied by WON / NO MATCH text.
- Heading hierarchy is real: one `h1` per page, no level skipped.
- The command palette is reachable and dismissible from the keyboard, and
  announces its result count.
- Rule conditions must be understandable without relying on indentation or color
  — each condition is a sentence (`state equals CA`), not a shape.
- All motion respects `prefers-reduced-motion`.

---

## 43. Responsive behavior

Desktop is the primary target: this is an operations tool used at a desk.

| Breakpoint | Width | Behavior |
|---|---|---|
| Mobile | < 768 px | Sheet navigation; cards instead of tables; drawer becomes a full-screen sheet; conditions stack vertically |
| Tablet | 768–1279 px | Icon-only sidebar; reduced columns (Name, Department, Role); drawers remain drawers |
| Desktop | 1280–1919 px | Full sidebar; all columns; 480 px drawer |
| Wide | ≥ 1920 px | Content capped at 1600 px; drawer 560 px |

Columns drop in a fixed order as width decreases: Employment type → Location →
Role → Department. Name never drops.

Horizontal scroll only where unavoidable, and only inside the table's own
container — the page body never scrolls sideways.

---

## 44. Signature user journeys

### Journey A — Why does this employee have this policy?

```
Employees → search "Alice" → Alice Chen → Policies
  → CA Meal Break Training → Why?
  → drawer: WON, California Employees, LOCATION · 800
  → ✓ state equals CA · Alice: CA
  → ● NOT APPLIED Standard Meal Break Training (already assigned by a
      higher-ordered rule)
  → "Assigned by Rule v3. The current rule is v4." → Compare → v3→v4 diff
```

**Outcome:** the admin understands the decision in seconds and can prove it.

### Journey B — Change an employee's attributes safely

```
Alice Chen → ⋯ → Edit → Department: Engineering → Sales
  → Effective from: today (or a past date, with permission)
  → Preview change
  → + Sales Commission · − Engineering Equipment Stipend · = 3 unchanged
  → Save change
  → header shows "⟳ 1 pending"; Policies refresh when applied
```

### Journey C — Create an assignment rule

```
Rules → New rule
  → Name, Rule type (sets the priority band, cannot change later)
  → Policy
  → Priority (defaulted from the band)
  → Effective from / to
  → Conditions: attribute → operator → value, exact matching
  → Preview matches → 428 of 1,284
  → Create rule            ← live immediately, subject to its effective window
```

Note what changed from v1: name and rule type are steps 1 and 2, and the last
step is **Create**, not Publish.

### Journey D — Investigate a conflict

```
Alice Chen → Vacation → Why?
  → WON: Executive Track, ROLE · 700
  → LOST: Standard Vacation, DEFAULT · 100 — "Lost to a higher-priority rule"
  → open Executive Track → Version history → v2→v3: priority 500 → 800
  → Audit → who made that change, and when
```

### Journey E — Onboard a new employee

```
Employees → Add employee → name, email, hire date, employment type,
  department, location, manager
  → Create employee
  → lands on the employee page
  → Reconcile now → + 5 assignments
  → Policies: ✓ Engineering Vacation ✓ CA Compliance Training
              ✓ Bi-weekly Pay ✓ GitHub ✓ Slack
```

This is CLAUDE.md's onboarding scenario. It runs **after** create, because
preview needs an employee id (§12.1).

---

## 45. Features worth building

Not decoration — each one exposes something the engine actually does.

1. **Why?** — one-click explanation for every assignment (§14).
2. **Preview before save** — server-computed consequences before a change commits (§16).
3. **Rule simulation** — the affected population before a rule exists (§20).
4. **Near-miss** — who almost qualified, and on which condition (§15).
5. **Historical time machine** — `asOf` across the point-in-time reads (§8).
6. **Rule version diff** — exactly what changed between two versions (§23).
7. **Consequence-aware confirmation** — impact before a destructive action (§41).
8. **Contextual command palette** — domain actions, not just navigation (§33).

These demonstrate the architecture rather than hiding it.

---

## 46. Settings

v1 put Settings in the nav and never described it. Its contents:

### 46.1 Organization

Name, and read-only metadata. `org:write` — `COMPANY_ADMIN` only. Hidden for
`HR_ADMIN`.

### 46.2 Teammates

`GET /user`, `POST /user`, `PATCH /user/:id`, `DELETE /user/:id`. `member:write`
— `COMPANY_ADMIN` only.

```
Teammates                                        + Add teammate

Name             Email                Role
Pratham Raj      pratham@acme.com     COMPANY_ADMIN
Dana Reed        dana@acme.com        HR_ADMIN
```

This is the only way to add a user to an existing organization —
`POST /auth/signup` always creates a **new** one (§9.1).

### 46.3 Policy categories

§25. `policy:write`, so both admin roles.

### 46.4 Reconciliation events

§31.5. `assignment:reconcile`.

---

## 47. Features explicitly deferred

Do not build these unless the backend gains support:

Natural-language rule creation · any AI assistant · organization-wide
reconciliation dashboard · organization-wide conflict inventory · policy coverage
charts · org chart visualization · CSV export · saved views · notifications ·
realtime reconciliation progress · nested AND/OR conditions · bulk mutation UI ·
employee and manager self-service (§2.1) · access grant/revoke UI (§28).

The goal is not maximum feature count. It is maximum product coherence.

---

## 48. Implementation phases

Two sequencing bugs from v1 are fixed: preview was in Phase 6 while the editing
that depends on it was in Phase 2, and rate-limit handling was in Phase 8 while
EXPENSIVE calls shipped from Phase 3.

### Phase 1 — Foundation

Next.js app and workspace wiring · Tailwind · shadcn/ui · **API client with 401
handling (§9.3) and 429/`Retry-After` handling (§40.5)** · login, signup, logout ·
token storage · session context · permissions derived from `ROLE_PERMISSIONS`
(§10.1) · role-unavailable page (§2.1) · layout and navigation · TanStack Query
with tier-aware defaults (§35.2) · global `asOf` · command palette shell.

### Phase 2 — Employees

Employee list, filters, URL state · employee detail shell · Policies tab ·
Attributes tab · Groups tab · employee create · employee edit **with preview**
(§16) · effective-date control with the back-dating gate · terminate.

*Preview moves here from v1's Phase 6: §16 says editing must not ship without it.*

### Phase 3 — Explainability

The explanation drawer · decision → label mapping · matched clauses with
attribute values · failed clause · category filtering · evaluation-date labelling
· rule-version banner · pre-migration fallback (§14.7) · near-miss section.

**The milestone.** This is the product's reason to exist.

### Phase 4 — Policies

Policy list · policy detail · rules-for-policy with ordering · **assigned
employees** (§27.3) · cardinality presentation · policy categories (§25).

### Phase 5 — Rules

Rule list with derived status · rule detail · flat condition builder on the
tree-shaped internal model (§19) · priority with band defaults · effective dates ·
simulation · matching employees · version history and diff.

### Phase 6 — Safe mutations and operations

Rule impact before save · consequence-aware confirmations (§41) · rule lifecycle
actions (§24) · manual override create and revoke (§30) · groups and membership
(§29) · reconciliation status strip and events (§31).

### Phase 7 — History

Global audit · employee audit · Timeline tab · historical-mode refinements
(§8.3, §8.4).

*v1 listed "global asOf" in Phase 1 and "historical navigation" in Phase 7 as if
they were different features. They are the same feature; what belongs here is the
edge-case handling.*

### Phase 8 — Polish

Command palette refinement · keyboard shortcuts · skeletons · empty states ·
accessibility audit · responsive behavior · performance.

---

## 49. Acceptance criteria

Each criterion is an observable assertion, not a feeling. v1's "understand why…"
items could not be tested.

### Explain

1. From `/employees`, an admin reaches a named employee's Policies tab in ≤ 3 clicks.
2. Every assignment row exposes a `Why?` control.
3. The drawer names the winning rule, its type, its priority and its version.
4. The drawer lists each matched condition **with the employee's value beside it**.
5. The drawer lists at least one non-winning rule with its decision label from §14.4.
6. For a `NOT_MATCHED` rule, the drawer shows the failed condition, the employee's
   value, and the short-circuit note.
7. The drawer shows only this assignment's category by default; others are behind
   a disclosure.
8. When `sourceRuleVersion !== rule.version`, the version banner appears and links
   to the diff.
9. An assignment explained before the clause migration shows the §14.7 fallback,
   not an empty card.

### Change safely

10. Editing an attribute requires a **Preview** before **Save** is enabled.
11. The preview lists added, removed and unchanged policies, labelled
    "nothing has been saved".
12. An admin without `employee:backdate` sees no past-date option.
13. Saving surfaces the backlog indicator; refetching shows the new state.
14. A manager change shows the "not included in this preview" notice.

### Configure

15. The rule form requires name, rule type and policy before it can be submitted.
16. Selecting `DEFAULT` hides the condition builder.
17. The operator list changes with the selected attribute, and never offers an
    operator the server rejects.
18. Tenure is entered in years and displayed as `≈ 5 years (1,825 days)`.
19. A group condition renders the group's **name**, never a UUID.
20. **Preview matches** returns a count and a sample, and is never fired automatically.
21. The submit button reads **Create rule**. The word "publish" appears nowhere.

### Investigate

22. A policy page lists its rules in engine order with priorities.
23. A SINGLE policy states that the highest-priority matching rule wins; a
    MULTIPLE policy states that rules do not compete.
24. **View all** on assigned employees lists them with source rule and effective
    window, each with a `Why?`.
25. The audit log filters by entity type, actor and date range, and its search box
    is labelled as searching actions.

### Operate

26. **Reconcile now** returns `+ / − / =` counts inline, without a page reload.
27. The header shows a pending count when the backlog is non-zero, and nothing
    when it is zero.
28. A failed reconciliation event is reachable in ≤ 2 clicks from the header
    warning.
29. Terminated employees show the terminated banner and no Reconcile or Preview
    controls.
30. A 429 renders an inline countdown in the originating panel, and the client
    does not auto-retry.

### Honesty

31. No screen shows a count, status or state that this document has not traced to
    an endpoint or DTO field.
32. Archiving a policy warns that existing assignments are not removed.
33. Retiring a rule is labelled **Retire** and states that history is preserved.
34. An override's create dialog carries the priority tie-break caveat.
35. `MANAGER` and `EMPLOYEE` logins land on the role-unavailable page.

---

## 50. Engineering principles

**The server is authoritative.** Never reproduce policy evaluation in the
browser. The one permitted client-side ordering is the rule display sort (§17.4),
which uses the engine's own constants from `@policy/shared` and never decides
anything.

**Explainability is data, not decoration.** The resolution trail is a domain
primitive with six decision states and per-clause detail. Do not reduce it to a
generic details modal.

**Preview is safety.** Any mutation that can change assignments should expose its
consequences whenever the backend can compute them — and should say so plainly
when it cannot (§16.2, §29.4, §41.3).

**Historical correctness matters.** Use `asOf` and rule versions consistently.
Show the value that was true then, not the value that is true now (§14.3).

**Derived state stays derived.** Never build a flow implying assignments are
directly editable.

**Do not fake unavailable capabilities.** If the backend cannot supply a metric,
a realtime state, an aggregate or a bulk operation, either add the API
deliberately — as was done for §4.2 — or omit the UI. Never simulate it.

**Say what is not known.** A count that cannot be fetched efficiently, a state
with no signal behind it, a condition that was never tested: name the gap in the
interface. Every ⓘ note in this document exists because the alternative was a
confident lie.

---

## 51. The final product feeling

The finished application should feel like an operator console for a deterministic
policy engine, not an HR database.

A reviewer should open one employee and immediately understand:

```
WHO         Alice Chen

WHAT        CA Meal Break Training

WHY         The "California Employees" rule matched

HOW         state equals CA          → Alice: CA
            employmentType = FULL_TIME → Alice: FULL_TIME

WHY THIS    LOCATION · priority 800
RULE WON    beat "Standard Meal Break Training" (DEFAULT · 100)

WHEN        Assigned by Rule v3, effective Jan 1, 2026
            The current rule is v4                    [ Compare ]

WHAT ALMOST Executive Vacation — did not match tenure ≥ 5 years
HAPPENED    (Alice: 1,268 days)

WHAT IF     Preview the consequence before saving
```

Every line above is a real field from a real endpoint. That is the whole design
direction: **the UI should make the sophistication of the backend visible, and
should never claim more than the backend can prove.**

---

## Appendix A — Terminology

Use the CLAUDE.md terms. v1 drifted in several places.

| Use | Not | Why |
|---|---|---|
| Assignment rule | "policy rule" | CLAUDE.md's term |
| Manual override | "overridden" | Matches `MANUAL_OVERRIDE` and CLAUDE.md |
| Create rule | "publish rule" | Rules have no draft state (§18.7) |
| Retire rule | "delete rule" | It is a soft delete (§24) |
| Terminate employee | "delete employee" | It is a status change (§12.2) |
| Policy category | "category" alone | Distinguishes it from a UI grouping |
| Effective period | "timeline" | "Timeline" is the employee tab (§13.4) |
| Audit event | "history event" | Matches `AuditEventDTO` |
| Reconciliation backlog | "stale" | It is org-wide, not per-employee (§31.3) |

The product is referred to as **Policy** within an organization's own name in the
shell (`Acme Inc · Policy`). v1's "Warp Policy Intelligence" is a product name
that appears nowhere in CLAUDE.md.

**Cardinality** is always written `SINGLE` / `MULTIPLE` in caps when naming the
enum value, and spelled out in prose when explaining it.

---

## Appendix B — Known backend gaps

Carried from §4.3 and §3.3, in one place, for whoever picks up the backend next.
Each names the UI compromise it currently forces.

| Gap | Forces |
|---|---|
| No `ruleCount` on `PolicyDTO` | Column dropped from the policy list (§26.1) |
| No `memberCount` on `GroupDTO` | Column dropped from the group list (§29.1) |
| No distinct-attribute-values endpoint | Free-text condition values with an exactness warning (§18.4) |
| No `GET /employees/:id/assignments/history` | Timeline excludes assignments (§13.4) |
| Soft-deleted groups 404 on every read | Unresolvable-reference state (§29.5) |
| No actor name on `AuditEventDTO` | Batch user lookup and cache (§32.3) |
| No optimistic concurrency on rule edits | Last write wins, silently (§40.4) |
| Policy archive enqueues no reconciliation | The §41.3 warning |
| No aggregate audit row for rule fan-out | "System reconciled 428 employees" removed (§32.2) |
| No retry endpoint for a FAILED outbox row | Manual per-employee reconcile as the workaround (§31.5) |
| No `asOf` on `GET /employees` or `/employees/:id` | Historical-mode attribute banner (§8.3) |
| Zod issues flattened into one message | Form-level error banner only (§40.2) |
| Employee audit cannot filter assignment events | Explanatory note on the tab (§13.5) |
| No group-membership consequence preview | Vague-but-honest dialog copy (§29.4) |
