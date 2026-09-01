# Frontend Ideas

Research output for the brief in `docs/frontend.md`. This is an idea dump and a
grounding document — not the spec. The spec (`docs/frontend.md` proper) should be
written *after* the open questions at the bottom are answered.

Everything here is checked against the code. Where an idea needs something the
backend does not have, it says so in the same breath.

---

## 1. What this backend actually is

The brief's constraint #2 — "do not invent backend functionality" — turns out to be
the most useful thing in it, because the honest inventory changes which ideas are
cheap and which are fantasy.

### Implemented and load-bearing

| Capability | Endpoint / type | Why it matters to the UI |
|---|---|---|
| Point-in-time resolution | `ResolutionDTO`, `asOf` everywhere | Every screen can be a time machine, not just "now" |
| Per-rule decision trail **including losers** | `ResolutionTrailEntryDTO` | The explainability screen is a rendering job, not a research project |
| Failed-clause reporting | `failedClause: ConditionClause \| null` | Near-miss UI — **on live resolutions only** (`preview`, `simulate`, `matching-employees`). Stored explanations return `matchedClauses: []`, `failedClause: null` (`resolution.ts` `toStoredTrailEntry`) |
| Dry-run for an employee | `POST /employees/:id/preview` → `PreviewDTO` | Real added/removed/unchanged diff, writes nothing |
| Dry-run for a rule | `POST /rules/simulate` | Simulate before publishing |
| Affected-population preview | `GET /rules/:id/matching-employees` → `MatchingEmployeeDTO[]` | Per-employee match reason, with the clauses that matched |
| Rule version history | `GET /rules/:id/versions` | Rule diffing over time |
| Attribute history | `GET /employees/:id/attribute-history` | "What changed to cause this?" |
| Assignment explanation | `GET /assignments/:id/explanation` | Assignment + source rule version + trail of decisions and `reason` text. **No clauses** — see the row above |
| Audit log | `GET /audit-events`, `GET /employees/:id/audit` | Actor, action, before/after state |
| Manual overrides | `GET/POST /employees/:id/overrides`, `DELETE /overrides/:id` | Overrides are first-class, distinguishable from automatic |
| Manual reconcile, one employee | `POST /reconciliation/employees/:id` | The "recalculate now" button |
| Cardinality | `SINGLE` / `MULTIPLE` per category | The conflict UI only applies to SINGLE |
| Effective dating | half-open `[from, to)` **DATE** ranges | Timelines are day-granular |
| Groups, soft-deleted | `deletedOn`, memberships end-dated | Group history survives deletion |
| Org chart | `managerId` self-edge, derived `isManager` | Subtree-scoped views for managers |
| RBAC | permission strings, subtree/self scoping | Permission-aware UI is real, not decorative |

### Partially implemented

- **Reconciliation is per-employee only.** The pipeline is outbox → relay → BullMQ →
  one job per employee. There is no run, batch, or campaign entity, so nothing has an
  id you can point a progress bar at.
- **Group deletion fan-out** is written but has never been executed against a live
  database.
- **Rate limiting** returns `RateLimit-*` headers on every response (useful for a
  client-side backoff affordance), but the Redis path is unverified.

### Missing entirely

- **No dashboard or metrics endpoints.** Not one aggregate. Every number the brief's
  Phase 6 dashboard wants would be a new endpoint or an N+1 from the client.
- **No org-wide reconciliation.** The brief's mock — `1,284 employees evaluated,
  +82 / −31 / ~17` — has no backing. There is no run history, no "reconcile
  everyone", no aggregate diff.
- **No conflict inventory.** You can see a conflict *for one employee* by reading their
  trail. You cannot ask "show me every conflict in the organization."
- **No nested boolean logic.** See §4 — this is the big one.
- **No bulk mutations.** Every write is single-entity.
- **No realtime.** No SSE, no websockets. Reconciliation completion is invisible to
  the client.
- **No saved views, no notifications, no CSV export.**

---

## 2. Product thesis

The brief asks what a strong team would build. The honest answer starts with what
makes this system unusual, because that is the only thing worth designing around.

**Most HR tools tell you the state. This one can tell you the reasoning.** The
`ResolutionTrailEntryDTO` records every rule that was considered, whether it matched,
which clauses held, which clause failed, and why the winner won. Almost no product in
this category persists the losing branch of a decision.

So the thesis is:

> **A policy system where every answer is auditable back to its cause, and every
> change can be seen before it is made.**

Two primitives, both already backed by the API:

1. **Explain** — any assignment, any date, back to the clause.
2. **Preview** — any change, before it commits, as a diff.

Every screen should be reachable from one of those two verbs. If a screen serves
neither, it is probably a generic admin dashboard and should be cut.

The failure mode to avoid is exactly what the brief names: "dashboard-with-12-cards
syndrome." This product's dashboard is weak (no aggregate endpoints) and its
explainability is exceptional. Lead with the strength.

---

## 3. Personas

Derived from `ROLE_PERMISSIONS` in `packages/shared/src/permissions.ts`, not invented:

| Role | Real permissions | What they need |
|---|---|---|
| `COMPANY_ADMIN` / `HR_ADMIN` | everything, including `policy:write`, `rule:write`, `employee:backdate`, `assignment:override` | The full product |
| `MANAGER` | subtree-scoped reads | "What do my reports have?" |
| `EMPLOYEE` | self-scoped reads only | "What do I have, and why?" |

**Primary user for MVP: the HR admin who writes rules.** They are the only persona
who can cause a conflict, and conflicts are the product's hardest problem.

The employee-facing view is tempting because it is easy, but it exercises none of the
system's interesting behavior. Build it last, or not at all for the MVP.

`SELF_SCOPED_ROLES` and `SUBTREE_SCOPED_ROLES` already exist, so a permission-aware UI
is genuinely achievable — the API will refuse out-of-scope reads and the client can
mirror that instead of guessing.

---

## 4. The rule builder problem (read this before designing it)

**The brief asks for nested AND/OR condition groups. The backend does not support
them and it is not an oversight.**

From `packages/shared/src/conditions.ts`:

```
{ "version": 1, "all": [ {attribute, op, value}, ... ] }
```

Flat. AND-only. No `any`, no `not`, no nesting. The `version` discriminator exists
precisely so a boolean tree can arrive later as v2 without a migration.

Nine attributes: `department`, `state`, `country`, `location`, `employmentType`,
`role`, `tenureDays`, `isManager`, `groupId`. Eight operators: `eq`, `neq`, `in`,
`notIn`, `gte`, `lte`, `gt`, `lt`.

Three honest options:

**(a) Build the flat builder, and make the constraint a feature.** A rule is a list of
requirements that must *all* hold. That is a sentence an HR admin understands with no
training — arguably better than the nested trees in Workday and Salesforce that
[UI-Patterns' rule builder pattern](https://ui-patterns.com/patterns/rule-builder) warns
get incomprehensible past two levels. OR is expressible today as `in [A, B]` on one
attribute, which covers most real cases. Where it genuinely fails: "Engineering in CA
**or** Sales in NY" needs two rules.

**(b) Add `version: 2` nested conditions to the backend first.** Real work — evaluator,
narrowing in `candidates.ts` (currently relies on flat-AND to push clauses into the
query), migration-free but not effort-free. Do not start the frontend on the
assumption this lands.

**(c) Ship (a), design the component so (b) drops in.** Model the editor's internal
state as a tree that currently has exactly one root `all` node. Serialize to v1. The
UI never shows a nesting control until the backend advertises v2.

**Recommendation: (c).** It costs almost nothing now and avoids a rewrite.

Design notes regardless of which:

- **Attribute → operator → value, in that order**, with the operator list filtered by
  attribute type. `tenureDays` gets `gte`/`lte`; `department` gets `eq`/`in`. Never
  show an operator the evaluator will reject.
- **`tenureDays` must not be a raw number input.** Nobody thinks in 730 days. Show
  "2 years" and store days. The engine inverts tenure into a hire-date bound
  (`hireDateForTenure` in `candidates.ts`) — a detail the UI should hide completely.
- **`groupId` is a picker, never a UUID field.**
- **Live match count beside the builder.** `GET /rules/:id/matching-employees` makes
  this real. LaunchDarkly's [test-run pattern](https://launchdarkly.com/docs/home/flags/preview-rules/)
  is the reference: show *which* contexts are affected and what share, before saving.
- **Priority is a number and will be fought over.** Show the rule's position in the
  ordered list of rules for that category, not just the integer. "This rule is 3rd of
  7 for Vacation" is the meaningful statement.

---

## 5. Explainability — the strongest thing here

This is the feature that would make the frontend look like it was built by someone who
read the backend. Almost every piece is already in the DTO.

### The core screen: "Why does Alice have this?"

`GET /assignments/:id/explanation` returns `assignment`, `sourceRuleVersion` (the rule
text *as it stood when the assignment was made* — not as it stands now), and the full
`trail`.

Render as a decision transcript, not a card grid:

```
Alice Chen  ·  Vacation Policy (SINGLE)             as of 2026-09-02

WON    Executive Vacation Policy          priority 800
       ✓ department = Engineering
       ✓ tenureDays >= 1825   (Alice: 1,247 days)      ← see note
       Rule "Executive Track" v3, effective from 2026-01-01

LOST   Standard Vacation Policy           priority 100
       ✓ all clauses matched
       Lost to higher priority.

SKIPPED  Contractor Vacation Policy       priority 500
       ✕ employmentType = CONTRACTOR      (Alice: FULL_TIME)
```

Three things that make this better than the competition. **Correction:** items 1 and 3
are backed by the stored explanation; item 2 is NOT — `toStoredTrailEntry` in
`resolution.ts` returns empty clauses, so a stored explanation can say *which* rule
lost and the `reason` text, but not *which clause* failed. Clauses only exist on live
resolutions. Rendering the drawer below as drawn needs either the backend to persist
clauses on `assignment_resolution_events`, or a re-evaluation via `preview`:

1. **Losers are shown.** `decision: ResolutionDecision` distinguishes matched-but-lost
   from never-matched. Most systems show only the winner.
2. **`failedClause` gives near-miss.** For a skipped rule, show *the one clause that
   failed and the employee's actual value*. This is the field that turns "you don't
   qualify" into "you don't qualify **because** X, and it would take Y to change that."
3. **The rule version is pinned.** `sourceRuleVersion` means the explanation is
   historically honest — it explains the decision using the rule as it was, not as it
   is. Surface a "the rule has changed since" banner when
   `sourceRuleVersion.version !== currentVersion`.

### Near-miss as a product feature

Nobody builds this. On the employee page, a collapsed section:

> **Nearly matched (3)** — policies this employee just missed
> Executive Vacation — needs `tenureDays >= 1825`, currently 1,247 (**578 days away**)

**Correction:** not computable from the stored explanation. Computable from a *live*
`ResolutionDTO` (`POST /employees/:id/preview`, which is EXPENSIVE-tier and refuses an
empty change set) by filtering `NOT_MATCHED` entries
with exactly one `failedClause`. It answers a question HR is asked constantly and
currently answers by hand.

### Explain must be reachable from everywhere

Not a page you navigate to — a drawer you open from any assignment badge, any row, any
timeline entry. `Cmd+K → "why"` should work.

---

## 6. Preview and simulation

The second primitive, and the one that makes the product feel safe.

`PreviewDTO` returns `added` / `removed` / `unchanged` and writes nothing. This gives
the brief's Phase 18 wish "what changes if I publish this rule?" for free.

**Where preview belongs:**

- **In the employee edit form, live.** Change department Engineering → Sales and the
  form shows the consequence *before* save. This is the exact interaction CLAUDE.md
  describes, and `POST /employees/:id/preview` implements it.
- **In the rule editor, live.** `POST /rules/simulate` against the draft.
- **In the confirm dialog for any destructive change.** Disabling a rule should say
  "47 employees will lose Engineering Equipment Stipend", not "Are you sure?".

**Design rule:** never show a bare confirmation dialog for anything that touches
assignments. The system can compute the actual consequence, so a generic "are you
sure?" is a wasted opportunity and slightly dishonest.

---

## 7. Reconciliation UX — the honest version

**This is where the brief's imagination and the backend diverge most, and pretending
otherwise would produce a fake screen.**

The brief wants:

```
1,284 employees evaluated
+ 82 added   − 31 removed   ~ 17 changed
Completed 2 minutes ago
```

The backend has: an outbox table with per-row status (`PENDING`, `PROCESSING`,
`PROCESSED`, `FAILED`), one BullMQ job per employee, and a per-employee
`ReconciliationResultDTO`. There is **no run entity**, no aggregate, no completion
event, and no API that exposes outbox state at all.

Three ways forward:

**(a) Don't build a reconciliation page. Build a freshness indicator.**
The real user need is not "watch the worker" — it is *"is what I'm looking at
current?"*. This matches the
[stale-while-revalidate framing](https://blog.logrocket.com/ux-design/ui-patterns-for-async-workflows-background-jobs-and-data-pipelines/):
commit the UI to the best data available and advance freshness asynchronously. After
any mutation, show a quiet inline marker — *"reconciling…"* on the affected employee —
and resolve it by refetching. No new backend.

**(b) Expose the outbox read-only.** `GET /reconciliation/events` with status counts.
Small, honest, and gives a real systems view: pending depth, failed rows, oldest
unprocessed. **Failed rows are the genuinely important signal** — a `FAILED` outbox row
means reconciliation that is owed and will never happen unless someone intervenes.
That deserves a visible surface far more than a progress bar does.

**(c) Add a run entity.** Only if org-wide reconciliation becomes a real feature.
Significant backend work. Do not design screens against it yet.

**Recommendation: (a) now, (b) soon.** (b) is maybe half a day of backend and turns an
invisible subsystem into something an operator can trust.

**A trap to avoid:** effective dates are `DATE`, not timestamp. Two changes on the same
day collapse to a zero-length interval. The UI must never render an assignment timeline
with times of day, or users will report a bug that is actually the data model. Audit
events *do* carry full `TIMESTAMPTZ` — so the audit timeline can be precise while the
assignment timeline is day-granular. Two different components.

---

## 8. Information architecture

The brief's proposed nav is fine but wrong in emphasis. Ordered by how much of the
system's real capability each surface exercises:

```
Employees      ← primary. Explain + preview both live here.
Rules          ← where conflicts are created; the builder + simulation
Policies       ← configuration; coverage
Groups
Audit
Settings
```

**Cut from the brief's list:**

- **Dashboard** — no aggregate endpoints exist. A dashboard built from client-side N+1
  would be slow and would be the first thing a reviewer noticed. Either add metrics
  endpoints deliberately, or make the landing page *Employees* and skip the fake.
- **Assignments (top-level)** — assignments are not a thing users manage; they are
  derived. `GET /assignments` exists and is useful as a filtered view, but as a
  primary nav item it implies direct editing that the system deliberately forbids
  (see the comment in `routes/access.ts`: an assignment written by hand would be
  removed by the next reconciliation with nothing to explain it).
- **Reconciliation** — see §7. Becomes a Settings sub-page at most, until (b) lands.

**Employee detail** is the single most important screen. Suggested structure, with
every tab backed by a real endpoint:

```
Alice Chen                                    [Preview a change] [Reconcile]
─────────────────────────────────────────────────────────────────────────
Policies    Attributes    Groups    Timeline    Audit
            ↑             ↑         ↑           ↑
  GET /:id/assignments   /:id/attribute-history  /:id/audit
  + explanation drawer per row
```

With an `asOf` date control in the header that drives every tab. That single control is
what turns the page from a CRUD detail view into the time machine the data model
actually supports.

---

## 9. Interaction patterns worth the effort

Filtered to ones this product specifically benefits from — not a generic list.

- **`asOf` in the URL, globally.** Every list and detail view takes a date. Put it in
  the query string so a link to "what did this look like on Jan 1" is shareable. This
  is the highest-leverage interaction decision in the whole product.
- **URL as the source of truth for all filters.** [Standard practice in this
  category](https://www.setproduct.com/blog/data-table-ui-design); here it also makes
  every filtered view a shareable artifact for an audit conversation.
- **Command palette, scoped to real verbs.** `Cmd+K` → "explain", "preview", "reconcile",
  jump to employee. [Now an expectation](https://adminlte.io/blog/admin-dashboard-design/)
  in this class of tool, but only worth it if it does product-specific things.
- **Explanation drawer, not page.** Context is lost on navigation.
- **Permission-aware rendering from `/auth/me`.** Hide what the user cannot do rather
  than letting them discover it via 403. The permission strings are already granular
  enough to drive this directly.
- **`RateLimit-*` headers → a real backoff.** The API returns them on every response.
  A client that reads them and degrades gracefully is a small detail that reads as
  competence.

**Skip:** optimistic updates on anything that triggers reconciliation. The result is
computed server-side by the engine; guessing it client-side and being wrong would
undermine the one thing this product sells. Optimism is fine for a name edit, wrong for
an assignment.

---

## 10. Stack

The brief's proposed stack is right, with two notes.

- **Next.js + TypeScript + Tailwind + shadcn/ui + TanStack Query + TanStack Table +
  React Hook Form + Zod** — reasonable, and Zod is already the API's validation
  library — but **correction:** the Zod schemas live in `apps/api/src/validators`, not
  in `@policy/shared`, which has no Zod at all. Sharing them means moving them first.
  That is a real monorepo advantage worth exploiting and worth pointing at.
- **Drop Zustand unless something forces it.** Server state is TanStack Query's job;
  URL state is the router's. A third store usually ends up as a shadow copy of one of
  those. Add it when there is a concrete need, not at scaffold time.
- **Feature-based structure**, as the brief suggests — `features/{employees, rules,
  policies, groups, audit}` — because the domain boundaries are already clear in the
  backend and mirroring them keeps the API client colocated with its consumers.

The workspace is `apps/dashboard-panel` today and is in git but **not** an npm
workspace (root `package.json` pins `["apps/api", "apps/worker", "packages/*"]`).
Decide deliberately whether the frontend joins the workspace — joining it is what
makes sharing `@policy/shared` types possible.

---

## 11. Backend gaps the frontend will hit

In the order they will bite, for whenever `apis.md` gets written:

1. **Aggregates for any dashboard** — counts by category, coverage per policy, conflict
   inventory. Nothing exists.
2. **Outbox/reconciliation read endpoint** — §7(b). Small, high value.
3. **Bulk operations** — every write is single-entity. Bulk group membership will be
   the first felt.
4. **Org-wide `matching-employees` pagination** — a DEFAULT rule with no narrowable
   clauses sweeps the whole organization (`sweptWholeOrganization` in
   `RuleFanOutService`). The UI must paginate and warn.
5. **Conflict inventory** — "every SINGLE category where >1 rule currently matches"
   is not queryable.
6. **Nested conditions (v2)** — §4.
7. **Realtime or long-poll** — for reconciliation completion.
8. **CSV export** — will be asked for within a week of the first real user.

---

## 12. Ideas I'd cut

Stated because the brief invites 5–10 "wow" features and half the obvious ones are
traps here.

- **Natural-language rule creation.** Attractive in a demo, but the grammar is nine
  attributes and eight operators — a well-built form is faster than typing a sentence
  and *cannot* produce an invalid rule. Adds an LLM dependency to a deterministic
  system whose entire value proposition is determinism.
- **Policy coverage visualization** as a headline feature. Needs aggregate endpoints
  that do not exist, and a coverage chart is a weaker answer to "who gets this?" than
  `matching-employees` with per-employee reasons.
- **Org chart visualization.** `managerId` supports it and it would look good, but it
  serves no job-to-be-done here beyond what a subtree-filtered list already does.
- **A 12-card dashboard.** Named in the brief's own "avoid" list, and unbacked anyway.

---

## 13. Open questions

These change the design materially and I would rather ask than assume.

1. **Nested conditions — (a), (b) or (c) from §4?** Recommend (c). Changes how the rule
   builder is architected, so worth settling first.
2. **Is a dashboard required for the deliverable?** If it is being evaluated against a
   brief that expects one, we should add metrics endpoints deliberately rather than fake
   it client-side. If not, dropping it is the stronger choice and worth stating.
3. **Reconciliation: (a), (b) or (c) from §7?** Recommend (a) now, (b) soon.
4. **Does `apps/dashboard-panel` become an npm workspace?** Determines whether
   `@policy/shared` types and Zod schemas can be shared, which is one of the strongest
   available signals of a well-built monorepo.
5. **Employee/manager personas in scope for MVP, or admin only?** Recommend admin only.
6. **Is the invite flow (marked v2) needed for the frontend to be demonstrable?**
   Without it there is no way to create a second user through the UI.

---

## Sources

- [Rule Builder design pattern — UI-Patterns](https://ui-patterns.com/patterns/rule-builder)
- [SAP Fiori — Rule Builder](https://www.sap.com/design-system/fiori-design-web/v1-84/ui-elements/rules-builder)
- [Testing changes to flag targeting — LaunchDarkly](https://launchdarkly.com/docs/home/flags/preview-rules/)
- [Targeting rules — LaunchDarkly](https://launchdarkly.com/docs/home/flags/target-rules)
- [UI patterns for async workflows, background jobs, and data pipelines — LogRocket](https://blog.logrocket.com/ux-design/ui-patterns-for-async-workflows-background-jobs-and-data-pipelines/)
- [Eventual Consistency is a UX Nightmare — CodeOpinion](https://codeopinion.com/eventual-consistency-is-a-ux-nightmare/)
- [Data table UI design reference guide for 2026 — Setproduct](https://www.setproduct.com/blog/data-table-ui-design)
- [Admin Dashboard Design: Principles, Layouts & Examples — AdminLTE](https://adminlte.io/blog/admin-dashboard-design/)
- [Authorization Enforcement — Oso Authorization Academy](https://www.osohq.com/academy/authorization-enforcement)
- [Planning Your Authorization Model and Architecture — Permit.io](https://www.permit.io/blog/planning-authorization-model-and-architecture-full-2025-guide)
- [Access Control, Authentication, and Tracing in Decision Management — Sparkling Logic](https://www.sparklinglogic.com/technical-series-access-control-authentication-and-tracing-in-decision-management/)
