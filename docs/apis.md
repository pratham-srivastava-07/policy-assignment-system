# API Surface

Every API this product needs, with current build status.

Legend:

| Mark | Meaning |
| --- | --- |
| DONE | Built, wired, compiles, `requireAuth` applied where required |
| READY | Not built; no undecided product behaviour blocks it |
| BLOCKED | Not built; needs a product decision first (see "Open decisions") |

---

## Conventions

These hold for every endpoint below.

**Base path** — `/api/v1`. `GET /health` sits outside it.

**Response envelope**

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "message": "Employee not found", "code": "NOT_FOUND" }
```

`code` comes from `ERROR_CODES` in `@policy/shared`. Clients branch on the code,
never on the message text.

**Authentication** — stateful. `Authorization: Bearer <token>`; the token is
opaque and resolves to a `sessions` row. Everything except `/auth/signup`,
`/auth/login` and `/health` requires it.

**Tenancy** — the organization is ALWAYS derived from the authenticated session.
No endpoint accepts an organization id in a path, body or query parameter. This is
a security boundary, not a convenience.

**Effective dates** — `YYYY-MM-DD` calendar days, never timestamps. `effectiveTo`
is exclusive; `null` means open-ended. Point-in-time reads take `?asOf=`,
defaulting to today. The predicate is always:

```sql
effective_from <= :asOf AND (effective_to IS NULL OR effective_to > :asOf)
```

**Tenure** is derived from `hireDate` at read time. It is never accepted as input
and never stored.

**Pagination** — `?limit=` (default 25, max 100) and `?offset=`. List responses
return `{ items, total, limit, offset }`.

**PUT vs PATCH** — PUT replaces (omitted optional fields are cleared to null);
PATCH touches only the keys present.

**Reconciliation** — endpoints that change an input to policy resolution write an
`outbox_events` row inside the same transaction as the change. A relay (not built)
drains that table onto BullMQ. No endpoint enqueues a job outside its transaction.

---

## 1. Auth — DONE

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/signup` | Creates organization + first user + `COMPANY_ADMIN` membership + session, in one transaction. Returns the bearer token once. |
| POST | `/auth/login` | Email + password. Binds the session to the user's membership. |
| POST | `/auth/logout` | Revokes the session server-side. Idempotent. |
| GET | `/auth/me` | Current user, organization and role. |

Signup is the only path that creates an organization — there is no invite flow and
no `/organizations` endpoints.

---

## 2. Users — DONE

Login identities, as distinct from employees. Mounted at `/user`. Org-scoped
through `organization_memberships`.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/user` | Adds a teammate to the caller's organization with a role. |
| GET | `/user` | Users in the caller's organization. |
| GET | `/user/search?email=` | Exact email lookup within the organization. |
| GET | `/user/:id` | |
| PATCH | `/user/:id` | |
| DELETE | `/user/:id` | Cascades memberships and sessions — logs the account out everywhere. |

---

## 3. Employees — DONE

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/employees` | |
| GET | `/employees` | Filters: `department`, `state`, `country`, `location`, `employmentType`, `role`, `isManager`, `search`. |
| GET | `/employees/:id` | Includes derived `tenureDays`. |
| PUT | `/employees/:id` | |
| PATCH | `/employees/:id` | |
| DELETE | `/employees/:id` | Hard delete today — see open decision D4. |
| GET | `/employees/:id/attribute-history` | Effective-dated history of every tracked attribute. |

Writes accept an optional `effectiveFrom` (defaults: hire date on create, today on
update) and, in one transaction, update the row, write
`employee_attribute_history`, write an audit event, and enqueue reconciliation —
but only when an attribute a rule could match on actually moved. A name or email
edit enqueues nothing.

---

## 4. Groups — DONE

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/groups` | |
| GET | `/groups` | Filter: `search`. |
| GET | `/groups/:id` | |
| PUT | `/groups/:id` | |
| PATCH | `/groups/:id` | |
| DELETE | `/groups/:id` | |
| GET | `/groups/:id/members?asOf=` | Point-in-time roster. Added beyond the original spec — the member write routes are not usable without it. |
| POST | `/groups/:id/members` | Body: `employeeId`, optional `effectiveFrom`. |
| DELETE | `/groups/:id/members/:employeeId?effectiveTo=` | End-dates the membership; never deletes the row. |

Membership is a rule dimension, so both member writes enqueue reconciliation keyed
on the employee. Group rename and description edits do not.

---

## 5. Policy categories — READY

The unit that carries assignment cardinality (`SINGLE` / `MULTIPLE`). Table and
repository exist; no routes yet.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/policy-categories` | `name`, `key`, `cardinality`. |
| GET | `/policy-categories` | |
| GET | `/policy-categories/:id` | |
| PATCH | `/policy-categories/:id` | |
| DELETE | `/policy-categories/:id` | FK-restricted while policies reference it. |

Changing an existing category's cardinality from `MULTIPLE` to `SINGLE` is a
migration of live assignment state, not a field edit — see open decision D6.

---

## 6. Policies — READY

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/policies` | `categoryId`, `name`, `description`, `status`. |
| GET | `/policies` | Filters: `categoryId`, `status`. |
| GET | `/policies/:id` | |
| PUT | `/policies/:id` | |
| PATCH | `/policies/:id` | |
| DELETE | `/policies/:id` | FK-restricted while rules reference it. |
| GET | `/policies/:id/assignees?asOf=` | BLOCKED — needs assignments to exist. |

---

## 7. Assignment rules — partly BLOCKED

| Method | Path | Status | Notes |
| --- | --- | --- | --- |
| POST | `/rules` | READY | Writes the rule and its v1 `policy_rule_versions` snapshot in one transaction. |
| GET | `/rules` | READY | Filters: `policyId`, `ruleType`, `enabled`. |
| GET | `/rules/:id` | READY | |
| PUT / PATCH | `/rules/:id` | BLOCKED | Bumps `version` and writes a new snapshot. Blocked by D3. |
| POST | `/rules/:id/enable` | READY | |
| POST | `/rules/:id/disable` | READY | |
| DELETE | `/rules/:id` | BLOCKED | Blocked by D2. |
| GET | `/rules/:id/versions` | READY | Full edit history from `policy_rule_versions`. |
| POST | `/rules/:id/preview` | BLOCKED | "Which employees does this rule match?" Needs the engine. |

`conditions` is the versioned, flat, AND-only envelope:

```json
{
  "version": 1,
  "all": [
    { "attribute": "department", "op": "eq", "value": "Engineering" },
    { "attribute": "tenureDays", "op": "gte", "value": 730 }
  ]
}
```

Attributes: `department`, `state`, `country`, `location`, `employmentType`,
`role`, `tenureDays`, `isManager`, `groupId`.

Operators: `eq`, `neq`, `in`, `notIn`, `gte`, `lte`, `gt`, `lt`.

### Manual overrides

A manual override is a rule (`ruleType: "MANUAL"` plus `employeeId`), not a
separate entity. These are convenience routes over `/rules`:

| Method | Path | Status |
| --- | --- | --- |
| GET | `/employees/:id/overrides` | READY |
| POST | `/employees/:id/overrides` | READY |
| DELETE | `/employees/:id/overrides/:ruleId` | BLOCKED (D2) |

---

## 8. Assignments and explainability — BLOCKED

All of this needs the Assignment Engine, which needs D1.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/employees/:id/assignments?asOf=` | "Which policies apply to this employee on date Z?" |
| GET | `/employees/:id/assignments/history` | Every assignment ever held. |
| GET | `/assignments/:id/explanation` | Which rule won, which lost, and why — from `assignment_resolution_events`. |
| POST | `/employees/preview` | Onboarding screen: post a draft employee, get the policies they would receive. No writes. |
| POST | `/employees/:id/preview-change` | "Engineering to Sales" screen: post a proposed patch, get `{ added, removed, unchanged }`. No writes. |
| POST | `/employees/:id/reconcile` | Manual re-resolution trigger. |

The two preview endpoints are what make the product legible to a non-engineer
admin. They are pure functions of the engine — the same code path as
reconciliation, with no persistence.

---

## 9. Access — BLOCKED

`/access` is a read model over assignments whose category is application access.
It is not a separate table.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/access?employeeId=&asOf=` | All application access for an employee. |
| PUT / PATCH | `/access/:employeeId` | Promotion or demotion. Writes a MANUAL override rule underneath. |

No `POST`: access is derived from rules the moment an employee is created, never
granted from nothing.

Needs D1, and D5 — which categories count as "access".

---

## 10. Audit — READY

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/audit-events?entityType=&entityId=` | Change history for one entity. |
| GET | `/audit-events` | Org-wide activity feed. |

Read-only. Audit rows are written transactionally by the services that make the
change; nothing writes them over HTTP.

---

## 11. Ops — DONE

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Liveness. Outside `/api/v1`, unauthenticated. |

---

## Open decisions

Nothing in the BLOCKED rows can be built without these. They are product
decisions, not technical ones.

**D1 — Conflict resolution.** How does `rule_type` compose with the numeric
`priority` column? Is `rule_type` a coarse tier that outranks priority (manual >
role > department > location), or is `priority` the only sort key with `rule_type`
merely descriptive? And what breaks a tie between two enabled rules of equal
priority — created-at, rule id, most specific condition set? Everything in
sections 8 and 9 is downstream of this.

**D2 — Rule deletion vs disabling.** When a rule is deleted, what happens to the
assignments it produced? Refuse the delete while assignments reference it (what
the foreign key does today), end-date them, or delete them? And does a disabled
rule differ from a deleted one for assignments already in force?

**D3 — Retroactive rule edits.** If a rule's conditions change today, does that
rewrite assignments that were in force last month, or apply forward only?

**D4 — Employee termination.** `DELETE /employees/:id` is a hard cascade today.
Should termination instead be a status plus an end date that closes assignments
and preserves history? If so, `DELETE` becomes `POST /employees/:id/terminate`.

**D5 — Access categories.** Which `policy_categories` does `/access` cover — a
reserved `key`, a flag on the category, or a naming convention?

**D6 — Policy status and cardinality changes.** Does `status` (`DRAFT` /
`ACTIVE` / `ARCHIVED`) gate rule evaluation — do rules pointing at a `DRAFT`
policy produce assignments? And what happens to live assignments when a
category's cardinality changes from `MULTIPLE` to `SINGLE`?

---

## Explicitly not APIs

* The outbox relay and BullMQ workers — background processes, no HTTP surface.
* The Assignment Engine — a library the API and workers both call, not an endpoint.
* RBAC permission checks — `role` is on the auth context but not yet enforced.
* Rate limiting.
