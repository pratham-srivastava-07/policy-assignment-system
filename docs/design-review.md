# Review: `docs/design.md` and `docs/frontend.md`

Reviewed against the code as of commit `f19f0fd` (working tree). Every backend claim below was checked against `apps/api/src/**`, `packages/shared/src/**`, `packages/core/src/**`, `packages/db/prisma/schema.prisma` and `apps/worker/src/**`. `docs/apis.md` was not read, per instruction. Line numbers for `design.md` refer to the untracked file as it stands (1,795 lines).

---

## 1. Verdict

`design.md` is not implementable as written: its three signature surfaces — the explanation drawer's matched/failed clauses, the "assigned employees" view on a policy, and the employee's Groups tab — each depend on data or endpoints the backend does not return, and the spec never says so. The single biggest risk is §8: the drawer that the whole document is organised around is specified against `matchedClauses` / `failedClause` fields that `GET /assignments/:id/explanation` always returns empty (`packages/core/src/services/resolution.ts:560-577`), so Phase 3 as written would ship a screen that cannot render its own wireframe. The second-order risk is that `ideas.md` was treated as verified ground truth when several of its claims are wrong, and those errors were inherited verbatim.

---

## 2. Findings

Severity key: **BLOCKER** — implementation would fail or ship something false; **MAJOR** — wrong, must fix before build; **MINOR** — should fix; **NIT** — cosmetic or precision.

### BLOCKER

**1. The explanation drawer renders fields the explanation endpoint never populates.**
- Where: `design.md` §8 lines 341-367, §39 line 1369 ("Matched clauses"), §42 line 1567-1571 ("matched clauses", "failed clause"), §43 line 1677.
- Claim: `✓ state = CA / Alice: CA … ✕ employmentType = CONTRACTOR / Alice: FULL_TIME` rendered from the assignment explanation.
- Evidence: `packages/core/src/services/resolution.ts:560-577` — `toStoredTrailEntry` returns `matchedClauses: []` and `failedClause: null` for every stored trail entry, with the comment "The clauses are not stored on the event". `AssignmentExplanationDTO.trail` (`packages/shared/src/dto.ts:347-353`) is built from exactly this. The only field with clause information is the free-text `reason` string (`packages/core/src/engine/conditions.ts:251-270`). Live clauses exist only in `PreviewDTO.resolution` (`POST /employees/:id/preview`), which requires at least one hypothetical change (`apps/api/src/validators/assignment.ts:69-72`) and is on the EXPENSIVE tier.
- Fix: Either add clause persistence to `assignment_resolution_events` (backend change, name it in §2) or respecify the drawer to render `reason` text plus the rule version's `conditions` snapshot, and drop the per-clause ✓/✕ and "Alice: CA" lines.

**2. "Alice: CA" (the employee's actual value) is not returned anywhere for matched clauses, and for a historical assignment the current employee record is the wrong source.**
- Where: `design.md` §8 lines 346, 349, 366, 387 ("employee's actual value").
- Evidence: `ResolutionTrailEntryDTO` (`dto.ts:296-310`) carries clauses only. The actual value appears solely inside `reason` for NOT_MATCHED (`conditions.ts:258`). `GET /employees/:id` returns current attributes with no `asOf` (`apps/api/src/routes/employee.ts:114-120`, controller `employee.ts:64-79`), so joining a Jan-1 assignment against today's `state` can show the wrong value.
- Fix: State that actual values come from `employee_attribute_history` reconstructed at the assignment's `effectiveFrom`, or drop the line.

**3. The near-miss section has no data source on the employee page.**
- Where: `design.md` §9 lines 398-418, §40 line 1455, §42 line 1575, §43 line 1677.
- Claim: "Nearly matched (3) … Needs tenure ≥ 5 years … 578 days remaining."
- Evidence: Only `PreviewDTO.resolution` carries `failedClause` (Finding 1). Preview refuses an empty `changes` object (`validators/assignment.ts:69-72`), so the page must send a fake no-op change; it is EXPENSIVE-tier, org-keyed, capacity 5 (`packages/shared/src/rate-limit.ts:99-104`). Separately, the evaluator stops at the *first* failed clause (`conditions.ts:230-239`), so "nearly matched" is really "failed on its first clause" — a rule failing clause 1 of 5 would be shown as a near miss. ideas.md line 223-225 ("Computable today from any ResolutionDTO trail") is wrong for the stored trail and glosses over the first-failure semantics.
- Fix: Either specify a backend endpoint that returns a current-state resolution with clauses, or defer near-miss to §41 with the reason.

**4. Policy → assigned employees does not exist.**
- Where: `design.md` §3 line 122 ("Policy → Employees"), §8 line 322 ("policy employee rows"), §18 line 718 ("Employees 428"), §19 lines 745-749, §42 line 1589 ("assigned employee view"), §43 line 1711.
- Evidence: `apps/api/src/routes/policy.ts` has no employees sub-route. `GET /assignments` requires `employeeIds` (`validators/assignment.ts:21-40`, max 100 ids) — there is no `policyId` filter. The repository method `findForPolicyAsOf` exists (`packages/core/src/repositories/assignment.repository.ts:148-169`) but is not wired to any service or route.
- Fix: List `GET /policies/:id/assignments?asOf=` as a required backend endpoint in §2, and mark §19's "Assigned employees" block as blocked on it.

**5. Employee → groups does not exist.**
- Where: `design.md` §7 line 292 ("Groups" tab), §6 line 228/271 ("Groups" column), §42 line 1551, §20 line 786-788 (consequence preview for membership changes).
- Evidence: No `/employees/:id/groups` route (`routes/employee.ts`). `EmployeeDTO` has no group field (`dto.ts:110-136`). `findGroupIdsForEmployee` and `findHistoryForEmployee` exist in `employee-group.repository.ts:131-164` but are unrouted. The only path is `GET /groups/:id/members` per group — an N+1 across every group. ideas.md §8 lines 333-338 draws the Groups tab with an arrow to no endpoint.
- Fix: Add `GET /employees/:id/groups?asOf=` to the required-endpoint list; without it the Groups tab, the Groups column and the `groupIds` argument to preview (which "replaces the whole membership set", `validators/assignment.ts:46-49`) cannot be built.

**6. Search on rules, policies and audit is invented.**
- Where: `design.md` §11 line 466 ("[ Search rules... ]"), §18 line 715 ("[ Search ]"), §23 line 865 ("[Search]"), §26 lines 945-947 ("Search policies", "Search rules").
- Evidence: `listRulesQuerySchema` (`validators/rule.ts:160-169`) is `.strict()` with `policyId`, `ruleType`, `enabled` only. `listPoliciesQuerySchema` (`validators/policy.ts:77-82`) has `categoryId`, `status` only. `listAuditEventsQuerySchema` (`validators/audit.ts:13-31`) has `entityType`, `entityId`, `actorId`, `from`, `to`. All three `.strict()` — an unknown `search` param is a 400. Only employees (`validators/employee.ts:93`) and groups (`validators/group.ts:23`) accept `search`.
- Fix: Either add `search` to the three validators as a required backend change, or replace the search boxes with the filters that exist and drop "Search policies / Search rules" from the palette.

**7. The rule editor omits `ruleType` and `name`, both required to create a rule.**
- Where: `design.md` §12 lines 487-551, §39 Journey C lines 1399-1417 ("Select policy → Define conditions → Set priority → Set effective date → … Publish"), §43 lines 1693-1703.
- Evidence: `createRuleSchema` requires `ruleType: z.enum(RULE_TYPES)` and `name` (`validators/rule.ts:14-33`). `ruleType` decides the default priority band (`services/rule.ts:118`, `constants.ts:177-185`), is the tie-break in resolution (`engine/resolve.ts:92-95`), is a list filter, is NOT patchable (`validators/rule.ts:100-110`), and constrains conditions: DEFAULT must have zero clauses (`validators/rule.ts:81-87`), MANUAL is forbidden from this form.
- Fix: Add rule type and name to the editor and Journey C; state that DEFAULT hides the condition builder and that type cannot be changed after creation.

**8. "Publish" is not a backend concept; rules have no draft state.**
- Where: `design.md` §39 line 1417, §43 line 1703, §14 line 609 ("before the administrator publishes it"), §35 line 1246 ("another version was published").
- Evidence: `POST /rules` creates the rule with `enabled: data.enabled ?? true` (`services/rule.ts:120`) — live immediately, subject to its effective window. The only lifecycle states are `enabled` + `effectiveFrom/To`. "Draft" (§32 line 1179) is a *policy* status (`enums.ts:19`), not a rule status.
- Fix: Replace "Publish" with "Create rule" / "Save", and specify whether the editor sets `enabled: false` to emulate a draft.

**9. The rule-impact diff ("856 employees would no longer match") is not computable within the rate limit.**
- Where: `design.md` §15 lines 630-634, §36 lines 1276-1281.
- Evidence: Both `simulate` and `matching-employees` return `Page<MatchingEmployeeDTO>` with max 100 per page (`constants.ts:161`), EXPENSIVE tier, org-keyed, 5 burst / 20 per minute (`rate-limit.ts:99-104`). A set difference over 1,284 vs 428 employees needs ~18 calls. Totals alone give `1,284 → 428` but not "856 would no longer match" (some of the 428 may be new). §15 line 636 then says "use backend-supported simulation results rather than client-side inference" — the number shown *is* client-side inference.
- Fix: Show only the two totals, or specify a backend diff endpoint.

**10. §36's confirmation copy makes claims the backend cannot support.**
- Where: `design.md` §36 lines 1274-1283 ("This will affect 428 employees. Assignments potentially removed: CA Meal Break Training — 428. Nothing else will change.").
- Evidence: `matching-employees` answers who a rule *catches*, not who it *wins* for (`services/rule.ts:356-363` says so explicitly). In a SINGLE category, disabling a rule that 428 match may remove 0 assignments (a higher-priority rule already wins) and may *add* assignments (a lower rule now wins) — "Nothing else will change" is unknowable. Rule disable is `POST /rules/:id/disable` → outbox → async fan-out; there is no per-rule consequence preview.
- Fix: Reword to "428 employees currently match this rule; their assignments will be re-evaluated" and remove "Nothing else will change".

**11. `docs/design.md` contains no testing strategy and no per-phase tests, API dependencies or acceptance criteria.**
- Where: `frontend.md` lines 767 ("21. Testing strategy"), 862-869 (per phase: files, components, API dependencies, backend dependencies, tests, acceptance criteria); `design.md` §42 lines 1509-1659 has "Build:" bullets only.
- Evidence: the string "test" does not appear in `design.md`.
- Fix: Add a testing strategy section and, per phase, the six lists the brief asks for.

### MAJOR

**12. The global `asOf` control only drives a minority of the endpoints the spec says it drives.**
- Where: `design.md` §5 lines 171-210, §7 line 288, §40 line 1461, §27 line 973.
- Evidence: `asOf` is accepted by `/employees/:id/assignments`, `/assignments`, `/access`, `/groups/:id/members`, `/rules/:id/matching-employees`, `/rules/simulate`, `/employees/:id/preview`, `/reconciliation/employees/:id`. It is NOT accepted (strict schemas → 400) by `GET /employees` (`validators/employee.ts:76-95`), `GET /employees/:id` (no query parsing, `controllers/employee.ts:64-79`), `GET /rules`, `GET /policies`, `GET /groups`, `GET /audit-events`. Under `asOf=2026-01-01` the employee header shows today's department and `tenureDays` is computed as of `new Date()` (`packages/core/src/utils/serialize.ts:64,80`).
- Fix: List exactly which screens honour `asOf`; specify that the Attributes tab reconstructs from `/employees/:id/attribute-history` and that the header shows current values with a "showing current attributes" note in historical mode.

**13. The employee list's `group` filter and `sorting` do not exist.**
- Where: `design.md` §6 line 225 ("[Group]"), line 243 ("sorting"), §27 line 976 (`&group=engineering`).
- Evidence: `listEmployeesQuerySchema` (`validators/employee.ts:76-95`) is strict; no `group`, no `sort`. Repository orders by `name asc` only (`employee.repository.ts:126-134`).
- Fix: Drop the Group filter and column sorting or add both to the backend list.

**14. Employee list columns "Groups", "Policy count", "Freshness/status" have no backing.**
- Where: `design.md` §6 lines 228-233, 271-275.
- Evidence: Groups — Finding 5. Policy count — only via `GET /assignments?employeeIds=` batch (EXPENSIVE, org-keyed 5/20min, `routes/assignment.ts:18-24`), so every page of the list spends a burst token org-wide. Freshness — no endpoint exposes outbox or job state (`apps/worker/src/relay.ts`; `routes/index.ts` has no reconciliation read route). This contradicts §18 line 725 ("Counts should only be displayed when the backend can provide them efficiently").
- Fix: Remove the three columns from the default set or name the endpoints that will back them.

**15. "Reconcile now" is synchronous; §21 describes it as queued.**
- Where: `design.md` §21 lines 800-806 ("Reconciliation queued … Status: Reconciling…"), §35 lines 1258-1262 ("could not be queued").
- Evidence: `POST /reconciliation/employees/:id` runs the engine and writes in the request (`routes/reconciliation.ts:12-25`; `controllers/assignment.ts:109-129` awaits and returns the `ReconciliationResultDTO`). The queued path is the outbox, which no user action triggers directly and no endpoint reports on.
- Fix: Split §21 into (a) manual reconcile: immediate result with +/−/= counts; (b) after any save: "reconciliation pending" with no observable completion — state that the only signal is refetch.

**16. "Reconciliation failed … [Retry]" and "Understand stale/reconciling state" have no backend signal for the async path.**
- Where: `design.md` §21 lines 816-822, 824-833; §32 lines 1184-1186 (Reconciling / Stale / Failed); §43 lines 1721-1723.
- Evidence: Outbox FAILED rows (`relay.ts:244-258`, `438-465`) and BullMQ failed jobs (`apps/worker/src/queue.ts:61`) are not exposed by any route. ideas.md §7 recommended "(a) now, (b) soon"; design.md §3 line 134 picks (a) but §21/§32 render states only (b) can produce.
- Fix: Either add `GET /reconciliation/events` (ideas.md §7b) to the required-endpoint list and gate §21's failure/stale states on it, or reduce §21 to the synchronous case.

**17. Permissions are not returned by `/auth/me`.**
- Where: `design.md` §24 line 888 ("obtain the current user's permissions from the authentication/me endpoint"), §42 line 1527.
- Evidence: `MeDTO` is `{ user, organization, role }` (`dto.ts:100-104`); `AuthService.me` (`apps/api/src/services/auth.ts:289-306`). Permissions must be derived client-side from `ROLE_PERMISSIONS` in `@policy/shared/permissions.ts:105-116`, which makes §29 (workspace integration) a hard Phase 1 dependency rather than a nicety.
- Fix: Say "derive from `role` via `ROLE_PERMISSIONS` imported from `@policy/shared`".

**18. `@policy/shared` contains no validation schemas.**
- Where: `design.md` §29 lines 1044-1053 ("consume @policy/shared for … validation schemas"), §28 line 1017.
- Evidence: `packages/shared/package.json` has no `zod` dependency; `packages/shared/src/index.ts` exports enums, conditions (types/constants), constants, errors, permissions, rate-limit, dto, date. All Zod schemas live in `apps/api/src/validators/*.ts`, which the frontend cannot import without depending on the API app. ideas.md §10 lines 381-383 made the same claim.
- Fix: Either plan to move the schemas into `@policy/shared` (backend change) or state that the frontend redeclares form schemas and only shares types/enums.

**19. §24's scoping rule is wrong for most non-employee reads.**
- Where: `design.md` §24 lines 911-913 ("Managers should see their permitted subtree. Employees should see only their own permitted information").
- Evidence: Subtree scoping is applied only on `/employees/*` and `/access` (`routes/employee.ts`, `routes/access.ts`). MANAGER holds every `:read` permission (`permissions.ts:70-72,113`) and can call `/rules/simulate`, `/rules/:id/matching-employees` (org-wide names and emails), `/groups/:id/members`, `/audit-events` unscoped. EMPLOYEE can call `GET /assignments/:id/explanation` for any assignment id in the org — the route has `requirePermission(ASSIGNMENT_READ)` only, no self check (`routes/assignment.ts:28-33`). Conversely EMPLOYEE gets 403 on `GET /employees` (`routes/employee.ts:40-46`), on `/employees/:id/overrides` (needs `rule:read`), `/employees/:id/audit` (needs `audit:read`) and `/employees/:id/preview` (`denySelfScopedRole`).
- Fix: Replace the two sentences with a role × screen matrix built from `ROLE_PERMISSIONS` and the actual middleware on each route; flag the explanation-route gap to the backend.

**20. The employee Audit tab cannot show assignment events.**
- Where: `design.md` §7 line 292 ("Audit" tab), §23 lines 877-878 ("Alice received CA Meal Break Training"), §8 line 326.
- Evidence: `GET /employees/:id/audit` filters `entityType = employee, entityId = id` (`apps/api/src/services/audit.ts:68-71`). `assignment.created` / `assignment.ended` are written with `entityType = assignment` and the employee only in `metadata` (`resolution.ts:334-357, 383-403`). The global feed cannot filter on metadata (`validators/audit.ts:13-31`).
- Fix: Add "employee audit tab shows employee-entity events only; assignment events require `GET /audit-events?entityType=assignment&entityId=`" or request a backend filter.

**21. "System reconciled 428 affected employees" is an event that is never written.**
- Where: `design.md` §23 lines 874-875.
- Evidence: `reconciliation.ran` is per employee (`resolution.ts:434-451`, `entityType: EMPLOYEE`). The relay's rule fan-out writes no audit row (`relay.ts:289-328` logs to console only).
- Fix: Remove the line or request an aggregate fan-out audit event.

**22. The audit page's "[Action]" filter does not exist.**
- Where: `design.md` §23 line 865.
- Evidence: `validators/audit.ts:13-31` — no `action` param; strict.
- Fix: Drop or add to backend.

**23. §35's "another version was published after you opened this page" describes a conflict the backend cannot detect.**
- Where: `design.md` §35 lines 1243-1250.
- Evidence: `patchRuleSchema` (`validators/rule.ts:100-119`) has no expected-version field; `applyEdit` (`services/rule.ts:488-553`) unconditionally bumps from `before.version`. Last write wins; no 409 is ever raised for concurrent edits.
- Fix: Either request optimistic concurrency (`If-Match` / `expectedVersion`) or replace the example with an error the API does raise (e.g. `BACKDATING_NOT_PERMITTED`, `INVALID_EFFECTIVE_RANGE`, `ALREADY_EXISTS` from `packages/shared/src/errors.ts`).

**24. The employee edit flow drops the effective date, which is a gated capability.**
- Where: `design.md` §10 lines 424-437, §39 Journey B lines 1379-1397.
- Evidence: `PATCH /employees/:id` accepts optional `effectiveFrom` defaulting to today (`validators/employee.ts:48,68`; `services/employee.ts:458`); a past date requires `employee:backdate` (`middlewares/permission.ts:300-344`), held by COMPANY_ADMIN and HR_ADMIN only. The same applies to group membership add/remove and rule windows. The spec never mentions back-dating anywhere.
- Fix: Add an "Effective from" field to the edit form, membership dialogs and rule editor, with the permission-gated past-date behaviour.

**25. Manual overrides have no create/revoke flow.**
- Where: `design.md` §25 lines 915-935 (display only), §42 line 1621 ("manual overrides").
- Evidence: `POST /employees/:id/overrides` requires `policyId` and `effectiveFrom` (`validators/rule.ts:175-187`); revoke is `DELETE /overrides/:id` (`routes/override.ts:21-26`). Both are gated on `assignment:override`. Also, an override does not always win: default priority 1000 ties with an admin-typed 1000 on any other rule and falls to band/age tie-breaks (`engine/resolve.ts:85-111`), and a DEPARTMENT rule at 1000 beats a MANUAL at 999 (`constants.ts:171-175`). §25's "Manual override" badge only appears when the override won.
- Fix: Specify the override create dialog (policy, effective window, priority with its tie-break caveat) and the revoke action with its consequence text.

**26. Policy categories are never designed, yet every policy needs one.**
- Where: `design.md` §3 nav (lines 94-102), §18-19, §30 folder tree, §42 (no phase).
- Evidence: `createPolicySchema` requires `categoryId` (`validators/policy.ts:48-55`); categories carry cardinality, which is immutable after creation (`validators/policy.ts:29-40`); the `/access` feature keys on a category with key `application_access` (`constants.ts:198`). Routes exist at `/policy-categories` (`routes/policy-category.ts`).
- Fix: Add category management (list/create with cardinality; the immutability warning) to §18 or Settings, and to a phase.

**27. Archiving a policy does not enqueue reconciliation; §36 cannot promise a consequence for it.**
- Where: `design.md` §36 lines 1264-1285 (any "assignment-affecting action"), §19 line 753.
- Evidence: `PolicyService` comment and code: "no write here enqueues reconciliation" (`apps/api/src/services/policy.ts:229-236`, and no `outbox.enqueue` anywhere in the file). Rules against a DRAFT/ARCHIVED policy are skipped at the next evaluation (`engine/resolve.ts:320-331`), but existing assignments persist until something else reconciles those employees. §2's limitation list does not mention this.
- Fix: Add to §2 as a backend gap; make the archive confirmation say assignments are not recomputed until affected employees are next reconciled.

**28. "3rd of 7 rules for Vacation" requires reproducing the engine's sort in the browser.**
- Where: `design.md` §11 lines 482-485, §16 line 648, §44 lines 1729-1733 ("Never reproduce policy evaluation in the browser").
- Evidence: Rules are listed per policy (`validators/rule.ts:162`), not per category; category ordering needs all policies in the category then all rules per policy. The meaningful order is `priority DESC, band DESC, createdAt ASC, id ASC` (`engine/resolve.ts:85-111`) — the UI must reimplement it, including the band table.
- Fix: Either request a `GET /policy-categories/:id/rules` ordered endpoint, or state that the ordinal is computed client-side with the engine's exact comparator imported from `@policy/shared` constants.

**29. Rule condition values are free text with no source for a picker; "California" vs "CA" will silently not match.**
- Where: `design.md` §12 lines 499, 545 ("California"), §8 line 345 ("state = CA"), §27 line 975 (`state=CA`).
- Evidence: Employee `state` etc. are unconstrained strings (`validators/employee.ts:5,16-20`). Comparison is exact and case-sensitive (`engine/conditions.ts:163-178`); the list filter is exact (`employee.repository.ts:53-59`). No endpoint returns distinct attribute values.
- Fix: Specify where the value picker's options come from (a required distinct-values endpoint, or paging the employee list) and that comparison is exact.

**30. Settings is in the nav and nowhere else.**
- Where: `design.md` §3 line 102, §4 line 151, §30 line 1070. No section among the 45 describes it.
- Evidence: Plausible contents — teammates (`POST /user`, `member:write`, COMPANY_ADMIN only per `permissions.ts:108-111`), organization, categories — are all unspecified.
- Fix: Write the Settings section or remove the nav item.

**31. No authentication screens are specified.**
- Where: `design.md` §42 Phase 1 line 1525 ("authentication context") is the only mention.
- Evidence: The API is bearer-token (`apps/api/src/middlewares/auth.ts:27`), sessions are 7 days (`constants.ts:153`), `POST /auth/signup` creates a *new organization* every time (`services/auth.ts:44-83`), there is no invite flow, login returns 409 for multi-org users (`services/auth.ts:210-217`), and every 401 must route to login. Token storage (cookie vs localStorage) is undecided. ideas.md open question 6 is never answered.
- Fix: Add login, signup (with its "creates a new organization" semantics), logout, 401 handling and token storage to Phase 1.

**32. Phase 2 depends on Phase 6.**
- Where: `design.md` §42 line 1557 ("employee editing", Phase 2) vs line 1615 ("employee preview", Phase 6); §10 line 422 ("The employee edit experience must use the backend preview endpoint"); §44 lines 1741-1743.
- Fix: Move preview into Phase 2 or move editing into Phase 6.

**33. Rate-limit handling is deferred to Phase 8 but EXPENSIVE-tier calls ship in Phases 3, 5 and 6.**
- Where: `design.md` §42 line 1657 ("rate-limit backoff") vs simulate/matching (Phase 5, lines 1607-1609), preview (Phase 6), near-miss (Phase 3).
- Evidence: EXPENSIVE is 5 burst / 20 per minute per organization (`rate-limit.ts:99-104`); 429 carries `Retry-After` (`middlewares/rate-limit/index.ts:107-116`). One admin tuning a rule will hit it inside a minute.
- Fix: Move 429/`Retry-After` handling to Phase 1 (API client).

**34. The "Timeline" tab has no defined content and the assignment history it implies is not exposed.**
- Where: `design.md` §7 line 292, §8 line 324 ("assignment-related timeline entries"), §30 line 1078 (`components/timeline`).
- Evidence: `/employees/:id/assignments` returns only rows effective on `asOf` (`resolution.ts:97-110`). `findHistoryForEmployee` exists (`assignment.repository.ts:125-146`) but is unrouted. Attribute history (`/employees/:id/attribute-history`) is available; group history is not (Finding 5).
- Fix: Define the Timeline as attribute-history only, or request `GET /employees/:id/assignments/history`.

**35. `frontend.md` deliverables silently dropped: personas, jobs-to-be-done, screen inventory, API consumption strategy, required-endpoint list, research doc, final summary.**
- Where: `frontend.md` lines 97-131 (Phase 2), 683-735 (Phase 15: existing vs required vs optional endpoints), 738-768 (items 2, 3, 6, 20, 21), 888-913 (final deliverables and the closing question). `design.md` line 5 is the entire persona section.
- Evidence: None of these appear in `design.md`. The required-endpoint list is precisely what Findings 4, 5, 6, 14, 16, 22, 34 would populate.
- Fix: Add them, or state in §2 which brief items are consciously dropped and why.

**36. §31 does not define the visual system the brief asked to have defined.**
- Where: `frontend.md` lines 574-617 ("Define: typography, spacing, border radius, shadows, density … colors, semantic status colors, badges, icons, buttons …"); `design.md` §31 lines 1117-1171.
- Evidence: §31 contains adjectives only ("strong typography", "subtle borders", "limited shadows") — no type scale, spacing scale, radius, palette, status colour tokens, icon set, density values or breakpoints (§38 names Desktop/Tablet/Mobile with no widths).
- Fix: Add concrete tokens or explicitly defer to a design-tokens document.

**37. ideas.md errors inherited without verification.**
- Where: `design.md` §2 ("Strongly supported" list), §8, §9, §29.
- Evidence: ideas.md line 31 says `GET /audit` — the route is `/audit-events` (`routes/index.ts:36`). ideas.md line 204 "all backed by real fields" and line 223 "Computable today" — Findings 1 and 3. ideas.md lines 381-383 — Finding 18. ideas.md line 336-338 — Finding 5. ideas.md line 45-48 "Redis path is unverified" — the tree now has `RedisRateLimitStore` with in-memory fallback (`middlewares/rate-limit/index.ts:41-54`); design.md §2 does not update this.
- Fix: Re-verify every "Strongly supported" line in §2 against a route and a DTO field, and cite them.

### MINOR

**38. Trail decisions are not mapped to the drawer's three labels.**
- Where: `design.md` §8 lines 341, 353, 362 (WON / LOST / SKIPPED), §32.
- Evidence: Six decisions exist: `MATCHED_WON`, `MATCHED_LOST`, `NOT_MATCHED`, `SKIPPED_DISABLED`, `SKIPPED_OUT_OF_WINDOW`, `SKIPPED_POLICY_INACTIVE` (`enums.ts:83-90`). The drawer labels `NOT_MATCHED` as "SKIPPED" and says nothing about the three real skip reasons.
- Fix: Add a decision → label/colour table.

**39. "Lost to higher-priority rule" is wrong in MULTIPLE categories.**
- Where: `design.md` §8 line 358; §19 line 757 says the UI must not imply single-winner in MULTIPLE.
- Evidence: `MATCHED_LOST` in MULTIPLE means "same policy already claimed by a higher-ordered rule" (`engine/resolve.ts:397-414`).
- Fix: Render `reason` verbatim, or branch the label on `cardinality`.

**40. The explanation trail spans all categories and comes from the *latest* evaluation that touched the assignment, not the one that created it.**
- Where: `design.md` §8 line 390 ("historical rule version").
- Evidence: `findForEvaluation` returns every category's entries for that instant (`assignment-resolution-event.repository.ts:99-119`); `own[0]` is ordered `evaluatedAt desc` (`:122-140`), and unchanged assignments get a new event each reconcile (`resolution.ts:409-417`). The trail can name rules that did not exist when the assignment was made.
- Fix: State that the drawer filters trail by `categoryId` and labels the trail with its evaluation date.

**41. Employee list is not ACTIVE-only by default; TERMINATED is never designed.**
- Where: `design.md` §6, §7.
- Evidence: `validators/employee.ts:88-92` ("the list is NOT filtered to ACTIVE by default"). Reconcile on a TERMINATED employee is 409 (`resolution.ts:284-291`); the worker skips them (`processor.ts:145-153`); `DELETE /employees/:id` is termination with `terminatedOn` (`routes/employee.ts:138-145`).
- Fix: Add a status filter default, a terminated header state (hide Reconcile/Preview), and a terminate action with its consequence text.

**42. Soft-deleted groups are 404 on every group read, including the historical roster.**
- Where: `design.md` §20; §5's historical mode.
- Evidence: `GroupRepository.findById` filters `deletedOn: null` (`group.repository.ts:48-57`); `listMembers` calls `requireGroup` first (`services/group.ts:260`). A rule with a `groupId` clause for a deleted group renders as a bare UUID; a Jan-1 view of a group deleted in March cannot be opened.
- Fix: Add the state, and list "read deleted group by id" as a backend gap.

**43. Group member counts and "Policies affected" are N+1 / client-side scans.**
- Where: `design.md` §20 lines 765-767, 781-784.
- Evidence: `GroupDTO` has no count (`dto.ts:154-168`); count only via `GET /groups/:id/members?limit=1`. "Policies affected" needs every rule's `conditions.all` scanned for `groupId` clauses — `ruleType` is descriptive, not a filter for that (`validators/rule.ts:163`; a DEPARTMENT rule may carry a `groupId` clause).
- Fix: Drop the count from the list row or request it on `GroupDTO`; drop "Policies affected" or define the scan.

**44. Group membership add/remove is effective-dated and gated; §20 shows neither.**
- Where: `design.md` §20 lines 769-788.
- Evidence: `addGroupMemberSchema.effectiveFrom`, `removeGroupMemberQuerySchema.effectiveTo` (`validators/group.ts:31-47`), both under `requireBackdatePermission` (`routes/group.ts:40-54`).
- Fix: Add the date fields and the 403 state.

**45. Validation errors arrive as one flattened string; per-field form errors cannot be mapped from the response.**
- Where: `design.md` §35 lines 1237-1262; §28 line 1017 (Zod for validation).
- Evidence: `toHttpError` joins all Zod issues into `message` (`packages/core/src/utils/AppError.ts:35-47`); `ApiFailure` is `{ success, message, code }` (`dto.ts:33-37`).
- Fix: State that server validation errors render as a form-level banner and client Zod schemas must replicate server rules to get field-level errors.

**46. Rule "Active / Scheduled / Expired / Inactive" statuses are derived; the list can only filter on `enabled`.**
- Where: `design.md` §11 line 468 ("[Status]"), §32.
- Evidence: `RuleDTO` has `enabled`, `effectiveFrom`, `effectiveTo` (`dto.ts:210-227`); filter is `enabled=true|false` (`validators/rule.ts:164-167`).
- Fix: Define the derivation against `asOf` and say the Status filter maps to `enabled` only.

**47. Priority and effective-date filters on the rule list do not exist.**
- Where: `design.md` §11 line 468 ("[Priority] [Effective date]").
- Evidence: `validators/rule.ts:160-169`.
- Fix: Remove or request.

**48. Policy list rule counts are N+1.**
- Where: `design.md` §18 line 718 ("Rules 2").
- Evidence: Only `GET /rules?policyId=&limit=1` → `total` per row.
- Fix: Drop or request a count on `PolicyDTO`.

**49. Rule list "Policy" column and audit "actor" names need lookups the spec does not mention.**
- Where: `design.md` §11 line 473, §23 line 868 ("Pratham changed rule").
- Evidence: `RuleDTO.policyId` only; `AuditEventDTO.actorId` only (`dto.ts:213, 255`). Actor name is `GET /user/:id` (`member:read`; EMPLOYEE lacks it, `permissions.ts:115`).
- Fix: Specify the lookup/cache strategy.

**50. `managerId` is editable but not previewable; `isManager` is previewable but ignored on save.**
- Where: `design.md` §10 line 430 ("Change state / department / role / group").
- Evidence: `previewEmployeeSchema.changes` has `isManager`, no `managerId` (`validators/assignment.ts:57-67`); `patchEmployeeSchema` accepts `managerId` and ignores `isManager` (`validators/employee.ts:30-37`; `services/employee.ts:257-260`).
- Fix: State that the edit form exposes Manager (a person picker), never an "Is manager" toggle, and that manager changes have no consequence preview.

**51. Tenure-in-years conversion is unspecified; leap years make "5 years" ≠ 1825 days.**
- Where: `design.md` §12 lines 501, 541-545; §9 line 414 ("578 days remaining").
- Evidence: `tenureDaysAsOf` is calendar-day arithmetic (`packages/shared/src/date.ts:37-52`).
- Fix: State the conversion (e.g. 365 × years, shown as "≈ 5 years (1,825 days)").

**52. Duplicate (attribute, operator) clauses are rejected server-side; the builder does not prevent them.**
- Where: `design.md` §12 line 511-513.
- Evidence: `ruleConditionsSchema.superRefine` (`validators/conditions.ts:111-132`).
- Fix: Add the constraint to the builder rules.

**53. Same-day supersession produces zero-length assignment intervals.**
- Where: `design.md` §5 lines 208-210 warns about time-of-day only.
- Evidence: Reconcile closes with `effectiveTo = asOf` and opens with `effectiveFrom = asOf` in one transaction (`resolution.ts:330-332, 373-374`); a rule edited twice today leaves a `[today, today)` row.
- Fix: State that any timeline view must drop or collapse zero-length intervals.

**54. Historical `asOf` before `hireDate` is unhandled.**
- Where: `design.md` §5.
- Evidence: Assignments list returns empty; `tenureDaysAsOf` clamps to 0 (`date.ts:49-52`); the header still shows current attributes (Finding 12).
- Fix: Specify an "employee was not yet hired on this date" state.

**55. Preview's baseline is the engine's current answer, not materialized state.**
- Where: `design.md` §10 lines 438-448.
- Evidence: `resolution.ts:192-196` ("comparing against materialized state would fold in any drift").
- Fix: Note that if the employee is stale, the preview diff and the Policies tab can disagree.

**56. `DELETE /rules/:id` and `POST /rules/:id/disable` have no UI, and §36's example for disable is the only mention.**
- Where: `design.md` §36; §42 Phase 6.
- Evidence: `routes/rule.ts:66-102` — enable, disable, delete (soft: disabled + end-dated today, `services/rule.ts:555-578`).
- Fix: Specify the three actions and that "delete" is displayed as "retire" with an end date.

**57. Application access (`/access`) is absent from the design.**
- Where: `design.md` — no mention.
- Evidence: `routes/access.ts` (GET/PUT/PATCH), `APPLICATION_ACCESS_CATEGORY_KEY` (`constants.ts:198`). CLAUDE.md lists application access as a core policy area.
- Fix: State whether access is a first-class screen or just "policies in the application_access category".

**58. Employee create ("+ Add employee") is never designed.**
- Where: `design.md` §6 line 220.
- Evidence: `createEmployeeSchema` (`validators/employee.ts:50-55`) — required `name`, `email`, `hireDate`, `employmentType`; optional `effectiveFrom` (gated). CLAUDE.md's onboarding example ("Applicable policies … ✓ GitHub ✓ Slack") needs a preview on create, and `POST /employees/:id/preview` requires an existing id — so onboarding preview is impossible until after create.
- Fix: Add the create form and say onboarding preview runs only via `/rules/simulate` or after save.

**59. Phase 7 "historical navigation" duplicates Phase 1 "global asOf".**
- Where: `design.md` §42 lines 1535, 1637.
- Fix: Merge or define the difference.

**60. `Retry-After`/429 and 401 are never mentioned as states.**
- Where: `design.md` §33-35.
- Evidence: `middlewares/rate-limit/index.ts:103-116`; `middlewares/auth.ts:29-43`.
- Fix: Add both to §35.

**61. Row selection "where backend capabilities permit bulk operations" is a null set.**
- Where: `design.md` §6 line 249 vs §2 line 78 and §41 line 1503.
- Fix: Remove the bullet.

**62. Pagination sizes, search debounce and responsive breakpoints are never stated.**
- Where: `design.md` §6, §27, §38.
- Evidence: Default 25, max 100 (`constants.ts:159-161`); simulate/matching pages are `limit`-bounded too.
- Fix: State defaults and how "View all" pages a 1,284-row result under the EXPENSIVE limit.

### NIT

**63. Terminology drift.** "policy rule" (§39 line 1399, §43 line 1693) — CLAUDE.md term is "assignment rule". "Warp Policy Intelligence" (§4 line 141) — product name not in CLAUDE.md. "Overridden" (§32 line 1183) vs the enum `MANUAL_OVERRIDE` and the CLAUDE.md term "manual override". "Assigned" (§7.1, §32) is not a backend status; every returned row is assigned. "Publish" (Finding 8). "Timeline" is used for both audit (TIMESTAMPTZ) and assignments (DATE) in §8 line 324 despite §5's warning.

**64. Internal example inconsistencies.** §11 line 473 puts California Employees on Meal Break, line 483 says "for Vacation"; §16 line 648 says "1st of 4" for the same rule. §21 line 814 uses `~` for "unchanged"; §22 line 847 uses `~` for "changed".

**65. Hand-waves.** "where backend capabilities permit" (§6 l.249), "[More]" (§6 l.225), "where applicable" (§8 l.326), "where possible" (§26 l.958), "where available" (§20 l.788), "where practical" (§33 l.1211), "when appropriate" (§24 l.909), "where unavoidable" (§38 l.1343), "Conceptually:" (§14 l.589), "performance optimization" (§42 l.1659), "Investigate an assignment" (§43 l.1713).

**66. Untestable acceptance criteria.** §43 lines 1671 ("Understand why"), 1689 ("Understand that reconciliation may happen asynchronously"), 1721 ("Understand stale/reconciling state"), 1725 ("Respect role permissions"), 1713 ("Investigate an assignment"). Each needs a browser-observable assertion.

**67. `/auth/me` field naming.** §24 line 888 says "authentication/me endpoint"; the route is `GET /api/v1/auth/me` (`apps/api/src/index.ts:17`, `routes/auth.ts:19`). The `/api/v1` prefix appears nowhere in `design.md`.

**68. Doc path references.** `frontend.md` line 55 and `CLAUDE.md` reference `docs/db.md`; the file is `docs/database.md`. `frontend.md` line 742 asks the response to be written *to* `docs/frontend.md`, which is the brief's own path; the response landed in `design.md`.

**69. `design.md` has no markdown headings.** Sections are bare numbered lines (e.g. line 8 "1. Product thesis"), so nothing is linkable or navigable; 45 sections in 1,795 lines with no TOC.

**70. `frontend.md` asks for the impossible in three places and `design.md` handles two.** Nested AND/OR (§12-13, pushed back honestly), org-wide reconciliation mock (§21-22, pushed back honestly), dashboard (§3, pushed back honestly). The brief's Phase 7 policy-list fields "effective date", "version", "assignment source" have no counterpart on `PolicyDTO` (`dto.ts:195-204`) and were dropped without a sentence saying so.

**71. The task brief's own premise about `sweptWholeOrganization` is off.** `sweptWholeOrganization` is a worker-side `FanOutResult` field (`rule-fan-out.ts:35-50`), never returned by `matching-employees`. The API sweep always loads every active employee (`services/rule.ts:422`, `employee.repository.ts:177-188`), so there is no UI state to design for it — but there is a performance state: every simulate is O(org).

---

## 3. Questions for the author

1. Finding 1 is the fork in the road: do you want the backend to persist matched/failed clauses on `assignment_resolution_events`, or should the drawer be respecified around `reason` text plus the version's `conditions` snapshot?
2. Near-miss (§9): keep it and accept one EXPENSIVE preview call per employee-page load (with a no-op change), add a dedicated endpoint, or defer to §41?
3. Reconciliation: §3 says (a) freshness-only; §21/§32 need (b) an outbox read endpoint. Which one is the MVP — and if (a), do "Stale / Failed / Reconciling" get cut?
4. Personas: is the MVP admin-only (ideas.md Q5 recommendation) or must MANAGER and EMPLOYEE logins have a working landing page? The Employees list is a 403 for EMPLOYEE.
5. Auth: is org-creating signup an acceptable demo entry point, or is the invite flow (ideas.md Q6) required before the frontend can be demonstrated with two roles? Where is the bearer token stored?
6. Which of these are you willing to add to the backend before build: `GET /employees/:id/groups`, `GET /policies/:id/assignments`, `search` on rules/policies/audit, counts on `PolicyDTO`/`GroupDTO`, a distinct-attribute-values endpoint, moving Zod schemas into `@policy/shared`? The phase plan changes completely depending on the answer.
7. Do you want the `EMPLOYEE`-can-explain-any-assignment gap (`routes/assignment.ts:28-33`) fixed in the API, or should the client simply never expose the route to that role?
8. Is `docs/design.md` meant to *replace* the `docs/frontend.md` deliverable the brief names, or is the brief's numbered 22-item table of contents still expected somewhere?

---

## 4. What's good

- §3's refusal to build a dashboard, a top-level Assignments page, or a fake reconciliation console is the right call and the reasoning is stated in terms of what the API can do — this is the best part of the document and should survive every revision.
- §13 (tree-shaped editor state serialised to v1) is a genuinely good architectural decision that costs nothing now and is consistent with `RULE_CONDITIONS_VERSION` in `conditions.ts:101`.
- §5's warning about day-granular effective dates vs. timestamped audit events is correct and matches `schema.prisma:12-19`.
- §10 and §44's "server is authoritative, never guess assignment changes in the browser" is exactly right for a deterministic engine and is consistently applied in §21 and §36.
- §8's "This assignment was created using Rule v3. The current rule is v4" banner is directly backed by `AssignmentDTO.sourceRuleVersion` vs `RuleDTO.version` and is the kind of detail that shows the backend was read.
- §29's decision to make `apps/dashboard-panel` a workspace is correct and matches the root `package.json`; only the "validation schemas" line is wrong.
- The rule-editor principles in §12 (attribute → operator → value, operator list filtered by attribute type, tenure in years, group picker not UUID) all correspond to real constraints in `validators/conditions.ts` and `candidates.ts`.

---

## 5. Coverage note

- Read in full: `design.md` (all 1,795 lines), `frontend.md` (919), `ideas.md` (467), `notes.md`, `architecture.md`, `database.md`, `rules.md`, `CLAUDE.md`; every file under `apps/api/src/routes`, `validators`, `controllers`, `middlewares`, and `services/{rule,employee,policy,group,audit,access,auth}.ts`; `packages/shared/src/*`; `packages/core/src/{engine/*,services/*,utils/*,interfaces/resolution.ts}`; repositories for employee, assignment, audit-event, policy-rule, policy-rule-version, employee-group, group, assignment-resolution-event; `schema.prisma`; `apps/worker/src/*`; root and `packages/shared` `package.json`; `apps/dashboard-panel/package.json`.
- Not read: `docs/apis.md` (excluded by instruction); `apps/api/src/interfaces/*`, `services/user.ts`, `controllers/user.ts`, the remaining `packages/core` repositories (organization, membership, session, user, outbox, transaction, policy, policy-category), `packages/db/src/*`, migrations SQL, `infra/`, `background.md`, and any tests. None of the findings above depend on those files.
- Checklist coverage: A, B, C, D, E, F, G, H, I, J, K, L all checked. For E: ideas.md questions 1, 2, 4 are decided and consistent; 3 is decided in §3 but contradicted by §21/§32 (Finding 16); 5 and 6 are not decided (Findings 19, 31). For G: no numeric values in `design.md` conflict with validator caps because `design.md` states no page sizes, debounces or breakpoints at all (Finding 62).
- The review does not assess visual taste, prose style, or whether the recommended stack is the best choice; it assesses whether the document's claims are true and whether it is buildable.

---

## 6. Decisions (2026-09-02)

Answers from the author to the questions in §3. `design.md` should be revised against these.

| Q | Decision | Consequence for the spec |
|---|---|---|
| 1 | **Persist `matchedClauses` / `failedClause` on `assignment_resolution_events`.** | Blockers 1, 2, 3 become backend work, not spec changes. The drawer stays as drawn. Near-miss (§9) is computable from stored `NOT_MATCHED` entries once clauses persist — Q2 is resolved by this. "Alice: CA" still needs the value at `effectiveFrom`, not today's record (Blocker 2). |
| 6 | **Add `GET /employees/:id/groups?asOf=`, `GET /policies/:id/assignments?asOf=`, and `search` on rules / policies / audit-events.** Zod stays in `apps/api`; not moving to `@policy/shared`. | Blockers 4, 5, 6 close. §29's shared-schema claim comes out of the spec. |
| 3 | **(b) Outbox read endpoint.** | §21 / §32 Stale / Failed / Reconciling badges stay. §3's "freshness-only" wording should be reconciled with this. |
| 4 | **Admin-only MVP.** | MANAGER / EMPLOYEE get a "not available for your role" page. Q5's invite flow is not required to demonstrate the frontend. |

Still open for the author: Q5 (bearer token storage), Q7 (fix the `EMPLOYEE`-can-explain-any-assignment gap in the API — recommended, and independent of the frontend), Q8 (is `design.md` the deliverable the brief calls `docs/frontend.md`).

### Backend work package this implies

In dependency order, all before the frontend's Phase 3:

1. Persist clauses on `assignment_resolution_events` — migration + the write path in `ResolutionService`, plus `toStoredTrailEntry` reading them back.
2. `GET /employees/:id/groups?asOf=` — route `findGroupIdsForEmployee` / `findHistoryForEmployee`, already in `employee-group.repository.ts:131-164`.
3. `GET /policies/:id/assignments?asOf=` — route `findForPolicyAsOf`, already in `assignment.repository.ts:148-169`.
4. `search` on `listRulesQuerySchema`, `listPoliciesQuerySchema`, `listAuditEventsQuerySchema` and the three repositories behind them.
5. `GET /reconciliation/events` — read-only outbox status counts and FAILED rows; permission-gated.
6. Self-scope guard on `GET /assignments/:id/explanation` (`routes/assignment.ts:28-33`).
