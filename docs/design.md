Policy Assignment System — Frontend Design Specification

Status: Proposed
Audience: Frontend engineers, backend engineers, product/design reviewers
Primary persona: HR / People Ops administrator
Design principle: Make deterministic policy decisions understandable, previewable, and auditable.

1. Product thesis

The Policy Assignment System should not look like a generic HR CRUD dashboard.

Its core advantage is that the system can answer two questions that ordinary HR software usually hides:

Explain: Why does this employee have this policy?

Preview: What will change if I change this employee or rule?

The frontend therefore treats explainability and previewability as first-class product primitives.

Every major surface should reinforce one of these capabilities.

Product promise: Every policy assignment can be traced back to the rule and employee state that caused it, and important changes can be evaluated before they take effect.

2. Backend reality and design constraints

The frontend must be designed around capabilities that already exist.

Strongly supported capabilities

Point-in-time resolution through asOf

Per-rule resolution trail, including losing rules

Failed-clause reporting

Employee dry-run preview

Rule simulation

Rule matching-employee preview

Rule version history

Employee attribute history

Assignment explanation

Audit log

Manual overrides

Per-employee reconciliation

Policy category cardinality (SINGLE / MULTIPLE)

Effective dates

Group membership history

Manager/subtree scoping

RBAC and permission scoping

Current limitations

The frontend must not pretend the backend already supports:

organization-wide reconciliation runs

reconciliation progress entities

dashboard aggregates

organization-wide conflict inventory

nested AND/OR rule trees

bulk mutations

realtime reconciliation events

saved views

notifications

CSV export

These should be treated as explicit future capabilities, not simulated in the client.

3. Information architecture

The primary navigation is intentionally small.

Employees
Rules
Policies
Groups

----------------

Audit
Settings

Why there is no Dashboard

The current backend has no aggregate metrics API. Building a dashboard from client-side N+1 requests would make the UI slower and less honest.

The initial landing experience should therefore be the Employees workspace.

A dashboard can be added later once aggregate APIs exist.

Why Assignments are not a top-level navigation item

Assignments are derived from employees, policies, and rules. They are not independently managed records.

A top-level "Assignments" section would incorrectly imply that users should directly edit assignments.

Assignments should instead be discoverable through:

Employee → Policies

Policy → Employees

Rule → Matching Employees

Explanation drawer

Audit history

Why Reconciliation is not a top-level page

Current reconciliation is per employee. There is no run/campaign entity.

For MVP, reconciliation should appear as an action on employee pages and as a lightweight freshness state.

4. Global application shell

Desktop layout

┌──────────────────────────────────────────────────────────────────────────┐
│  Warp Policy Intelligence                     Search ⌘K       User / Org │
├───────────────┬──────────────────────────────────────────────────────────┤
│               │                                                          │
│  Employees    │                                                          │
│  Rules        │                 APPLICATION CONTENT                     │
│  Policies     │                                                          │
│  Groups       │                                                          │
│               │                                                          │
│  ───────────  │                                                          │
│  Audit        │                                                          │
│  Settings     │                                                          │
│               │                                                          │
└───────────────┴──────────────────────────────────────────────────────────┘

Navigation requirements

persistent left navigation on desktop

compact navigation on smaller screens

current section clearly indicated

permission-aware navigation

organization context always visible

global search / command palette via Cmd/Ctrl + K

Do not overload the sidebar with metrics or decorative elements.

5. Global time control

The data model supports point-in-time resolution.

This should become a visible global interaction.

As of:  Sep 2, 2026
        [ Today ▼ ]

Selecting a date changes the state being viewed.

The selected date should be encoded in the URL:

/employees?asOf=2026-09-02

and preserved when navigating between relevant screens.

Why this matters

This turns ordinary CRUD pages into a historical inspection tool.

An HR administrator can answer:

What policies did this employee have on January 1?

without manually reconstructing historical state.

UI rules

default to today

make historical mode visually apparent

show the selected date near the page title

preserve it across navigation

do not render effective-date assignment timelines with time-of-day precision

Effective dates are day-granular. Audit events may use exact timestamps, but assignment effective periods must remain date-based.

6. Employees

Employees are the primary workspace.

Employee list

Layout

Employees                                  + Add employee
1,284 employees

[ Search employees... ]

[Department] [State] [Role] [Group] [Employment type] [More]

┌──────────────────────────────────────────────────────────────────────────┐
│ Employee       Department       Location    Groups      Policies         │
├──────────────────────────────────────────────────────────────────────────┤
│ Alice Chen     Engineering      CA          3           8                 │
│ Ben Carter     Sales            NY          2           5                 │
│ Maya Singh     Engineering      CA          4           9                 │
└──────────────────────────────────────────────────────────────────────────┘

Table principles

The employee table should be dense and operational.

Support:

search

sorting

filtering

pagination

row selection where backend capabilities permit bulk operations

URL-persisted filters

shareable filtered URLs

Do not show every employee attribute as a column.

Columns should answer operational questions.

Recommended default columns:

Name

Department

Role

Location

Employment type

Groups

Policy count

Freshness/status

7. Employee detail — flagship screen

This is the most important page in the application.

Header

Alice Chen
Engineering · Full-time · California

[Preview a change] [Reconcile now] [More]

As of: Sep 2, 2026

Navigation

Policies | Attributes | Groups | Timeline | Audit

Each tab is backed by real domain data.

7.1 Policies tab

Policies assigned to Alice

┌─────────────────────────────────────────────────────────────────────┐
│ Policy                    Category      Source          Status       │
├─────────────────────────────────────────────────────────────────────┤
│ CA Meal Break Training    Compliance   California Rule Assigned     │
│ Engineering Equipment     Benefits     Engineering Rule Assigned   │
│ Vacation                  Time Off     Executive Rule Assigned     │
└─────────────────────────────────────────────────────────────────────┘

Every assignment row should expose:

Why?

Opening it should launch an explanation drawer without leaving the employee page.

8. Assignment explanation drawer

This is the application's signature interaction.

Trigger

Available from:

employee policy rows

policy employee rows

assignment-related timeline entries

audit references where applicable

command palette

Drawer

┌──────────────────────────────────────────────────────────────────────┐
│ Why does Alice have this policy?                              Close  │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ CA Meal Break Training                                               │
│ Assigned · SINGLE                                                    │
│                                                                      │
│ WON                                                                  │
│ California Employees                              Priority 800      │
│ Rule v3 · Effective Jan 1, 2026                                      │
│                                                                      │
│   ✓ state = CA                                                       │
│     Alice: CA                                                        │
│                                                                      │
│   ✓ employmentType = FULL_TIME                                       │
│     Alice: FULL_TIME                                                 │
│                                                                      │
│ ──────────────────────────────────────────────────────────────────── │
│                                                                      │
│ LOST                                                                 │
│ Standard Meal Break Training                       Priority 100      │
│                                                                      │
│   ✓ All clauses matched                                              │
│                                                                      │
│   Lost to higher-priority rule                                       │
│                                                                      │
│ ──────────────────────────────────────────────────────────────────── │
│                                                                      │
│ SKIPPED                                                              │
│ Contractor Training                                Priority 500      │
│                                                                      │
│   ✕ employmentType = CONTRACTOR                                      │
│     Alice: FULL_TIME                                                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘

Important behavior

Show:

winning rule

priority

rule version

matched clauses

losing rules

skipped/non-matching rules

failed clause

employee's actual value

historical rule version

If the rule has changed since the assignment was created, display:

This assignment was created using Rule v3. The current rule is v4.

This is important for historical correctness.

9. Near-miss experience

The employee page should contain a secondary section:

Nearly matched (3)

Example:

Executive Vacation

Needs:
tenure ≥ 5 years

Current:
3 years 5 months

578 days remaining

This should be collapsed by default.

Its purpose is not to create another dashboard feature. It is to expose the existing failed-clause information when it is useful.

10. Previewing employee changes

The employee edit experience must use the backend preview endpoint.

Flow

Employee
   ↓
Edit attributes
   ↓
Change state / department / role / group
   ↓
Preview consequence
   ↓
Review policy diff
   ↓
Save

Example:

Change department

Engineering → Sales

Policy impact

+ Sales Commission Policy
- Engineering Equipment Stipend
  Vacation Policy        unchanged

The preview is explicitly labeled:

Preview — nothing has been saved.

Do not optimistically guess assignment changes in the browser.

The server is authoritative.

11. Rules

Rules are where administrators express policy eligibility.

Rule list

Rules                                      + New rule

[ Search rules... ]

[Policy] [Status] [Priority] [Effective date]

┌──────────────────────────────────────────────────────────────────────┐
│ Rule                     Policy              Priority    Status       │
├──────────────────────────────────────────────────────────────────────┤
│ California Employees     Meal Break         800         Active       │
│ Executive Track          Vacation           700         Active       │
│ Contractors              Training           500         Active       │
└──────────────────────────────────────────────────────────────────────┘

Priority should not be represented as an arbitrary number alone.

Display:

Priority 800
3rd of 7 rules for Vacation

The ordering is more meaningful than the raw integer.

12. Rule editor

Philosophy

The rule builder should feel like a policy configuration tool, not a programming language.

Current backend conditions are flat AND-only.

The UI should represent that honestly.

Employees must satisfy ALL of these:

[ State        ] [ equals       ] [ California       ]  [×]
[ Department   ] [ equals       ] [ Engineering      ]  [×]
[ Tenure       ] [ greater than ] [ 5 years          ]  [×]

                                              + Add condition

Condition structure

Every condition follows:

Attribute → Operator → Value

The available operators must be filtered by attribute type.

Never expose an operator that the evaluator cannot accept.

Attributes

Current domain attributes include:

department

state

country

location

employment type

role

tenure

manager status

group

Examples

Instead of:

tenureDays >= 1825

show:

Tenure is at least 5 years

Store the engine-compatible representation internally.

Never expose UUIDs for groups.

Use a group picker.

13. Future-proof rule builder architecture

The current backend supports:

{
  "version": 1,
  "all": []
}

The frontend should internally model conditions as a tree so that nested boolean logic can be introduced later without replacing the entire component.

However:

Do not show AND/OR nesting controls until the backend supports them.

Current UI:

ALL
 ├── condition
 ├── condition
 └── condition

Future UI can become:

ALL
 ├── condition
 └── ANY
      ├── condition
      └── condition

The serialized API contract remains version-dependent.

14. Rule simulation

The rule editor should provide an affected-population preview.

Conceptually:

California Employees

3 conditions

────────────────────────────────────────

Matches 428 employees

[Preview matching employees]

Alice Chen       Engineering   CA
Maya Singh       Engineering   CA
...

The goal is to answer:

Who will this rule affect?

before the administrator publishes it.

The matching-employee endpoint provides the server-authoritative result.

15. Rule impact before save

When a rule is changed, show the impact before committing.

Rule changes

BEFORE
State = CA

AFTER
State = CA
Department = Engineering

──────────────────────────────────────

Potential impact

1,284 → 428 matching employees

856 employees would no longer match

[View affected employees]

The exact display should use backend-supported simulation results rather than client-side inference.

16. Rule detail

A rule detail page should expose:

California Employees

Policy
CA Meal Break Training

Priority
800 · 1st of 4

Status
Active

Effective
Jan 1, 2026 → No end date

Then:

Conditions
────────────────────────────
State = California
Employment type = Full-time

Matching employees
────────────────────────────
428 employees

[View all]

Version history
────────────────────────────
v3   Sep 2
v2   Jun 12
v1   Jan 1

17. Rule version history

Version history should be a first-class inspection surface.

Rule versions

v3   Current
     Sep 2, 2026
     Added employment type condition

v2
     Jun 12, 2026
     Changed priority 500 → 800

v1
     Jan 1, 2026
     Created

Selecting a version should allow comparison:

v2 → v3

Priority
500 → 800

Conditions
State = CA
+
Employment type = Full-time

Historical explanations must link to the rule version that actually produced the assignment.

18. Policies

Policies are configuration objects, not the main decision engine.

Policy list

Policies                                  + New policy

[ Search ] [Category] [Status]

┌────────────────────────────────────────────────────────────────────┐
│ Policy                     Category       Rules      Employees       │
├────────────────────────────────────────────────────────────────────┤
│ CA Meal Break Training     Compliance     2          428             │
│ Engineering Stipend        Benefits       1          183             │
│ Vacation                   Time Off       4          1,024           │
└────────────────────────────────────────────────────────────────────┘

Counts should only be displayed when the backend can provide them efficiently.

Do not construct expensive aggregate counts through N+1 client requests.

19. Policy detail

CA Meal Break Training

Compliance
SINGLE

────────────────────────────────────────────

Rules

1. California Employees       Priority 800
2. Contractor Rule             Priority 500

────────────────────────────────────────────

Assigned employees

428

[View employees]

────────────────────────────────────────────

History

For SINGLE categories, explicitly explain precedence.

For MULTIPLE categories, the UI must not imply that only one policy can win.

20. Groups

Groups should provide a simple operational interface.

Groups                                  + New group

Engineering       142 members
Managers           31 members
Remote             286 members

Group detail:

Engineering

142 members

Members
────────────────────────────
Alice Chen
Maya Singh
...

Policies affected
────────────────────────────
Engineering Equipment
Vacation

Group membership changes may trigger reconciliation.

Therefore mutations that affect assignments should show server-backed consequences where available.

21. Reconciliation UX

Do not build a fake progress dashboard.

Current backend reconciliation is per employee.

Employee action

[Reconcile now]

After triggering:

Reconciliation queued

Policy state may update shortly.
Last evaluated: 2 minutes ago
Status: Reconciling…

When the operation is refreshed:

Reconciled

+ 1 assignment
- 0 assignments
~ 2 unchanged

If reconciliation fails:

Reconciliation failed

The employee's policy state may be stale.

[Retry]

Freshness indicator

The UI should communicate eventual consistency quietly.

Example:

Policies
Updated recently · Reconciling…

The user needs to know whether what they are looking at is current.

22. Future reconciliation operations

If the backend later introduces reconciliation runs, add:

Reconciliation

Running
1,284 / 1,284 employees

Results
+82 added
-31 removed
~17 changed

3 failures

[View failures]

Do not implement this screen against today's API.

23. Audit

Audit answers:

Who changed what, when, and what happened afterward?

Audit page

Audit log

[Search] [Actor] [Entity] [Action] [Date]

Sep 2 · 09:42
Pratham changed rule
California Employees

Priority
500 → 800

Sep 2 · 09:43
System reconciled 428 affected employees

Sep 2 · 09:44
Alice received CA Meal Break Training

Audit events use precise timestamps.

Do not confuse audit timestamps with effective-date intervals.

24. Permissions

Permission-aware rendering should be driven by the actual authorization model.

The client should obtain the current user's permissions from the authentication/me endpoint.

Examples:

policy:read
policy:write
rule:read
rule:write
employee:read
employee:write
employee:backdate
assignment:override

Rules

hide actions the user cannot perform

still rely on the server for enforcement

never treat client-side hiding as authorization

show a clear read-only experience when appropriate

Managers should see their permitted subtree.

Employees should see only their own permitted information.

25. Manual overrides

Overrides must be visually distinct from automatic assignments.

Example:

Vacation Policy

Assigned

Source
Manual override

Override expires
Dec 31, 2026

[View override]

Do not make an override look identical to a normal rule-derived assignment.

This distinction is critical for explaining why reconciliation did or did not change something.

26. Command palette

Cmd/Ctrl + K

The command palette should expose real product actions rather than generic navigation.

Examples:

Search employees
Search policies
Search rules

Explain this assignment
Preview employee change
Reconcile employee

Go to Employees
Go to Rules
Go to Policies
Go to Audit

The palette should be context-aware where possible.

On an employee page:

Explain current policy
Preview employee changes
Reconcile Alice Chen

27. Search and filtering

All meaningful filters should be represented in URL state.

Example:

/employees?
  asOf=2026-09-02
  &department=engineering
  &state=CA
  &group=engineering

Benefits:

browser navigation works

filtered pages are shareable

audit conversations can reference exact views

refresh does not destroy state

Do not duplicate URL state inside an independent global store.

28. Data fetching and state

Recommended stack:

Next.js

TypeScript

Tailwind CSS

shadcn/ui

TanStack Query

TanStack Table

React Hook Form

Zod

Do not add Zustand initially.

Responsibilities:

Server state       → TanStack Query
URL/filter state   → Next.js router/search params
Form state         → React Hook Form
Validation         → Zod
Component state    → React state

Only introduce a global client store when a concrete requirement appears.

29. Monorepo integration

The frontend should become an npm workspace.

Current root workspaces do not include apps/dashboard-panel.

Add it deliberately:

{
  "workspaces": [
    "apps/api",
    "apps/worker",
    "apps/dashboard-panel",
    "packages/*"
  ]
}

This allows the frontend to consume:

@policy/shared

for shared:

DTO types

condition schemas

enums

validation schemas

permission definitions

Do not duplicate backend domain types manually in the frontend.

30. Frontend architecture

Prefer feature-based organization.

apps/dashboard-panel/

app/
  (app)/
    employees/
    rules/
    policies/
    groups/
    audit/
    settings/

components/
  ui/
  layout/
  data-table/
  command-menu/
  explanation/
  timeline/

features/
  employees/
    api/
    components/
    hooks/
    schemas/
    types/

  rules/
    api/
    components/
    hooks/
    schemas/
    types/

  policies/
    api/
    components/
    hooks/
    schemas/
    types/

  groups/
  audit/

lib/
  api/
  auth/
  permissions/
  query/
  dates/


Domain-specific behavior belongs inside its feature.

Generic UI primitives belong in components/ui.

31. Design system

The visual language should feel like serious infrastructure software adapted for HR operators.

Characteristics

high information density

restrained visual hierarchy

strong typography

subtle borders

limited shadows

compact controls

clear semantic status colors

excellent whitespace discipline

minimal decorative gradients

predictable interaction patterns

The application should feel closer to:

Stripe Dashboard

Linear

Ramp

modern enterprise operations tooling

than to a marketing-heavy HR landing page.

Avoid

giant KPI cards everywhere

excessive rounded cards

gradient backgrounds

ornamental animations

AI sparkle icons

charts without operational value

fake real-time states

generic "success" toasts that hide important consequences

32. Status semantics

Use consistent semantic states.

Active
Inactive
Draft
Scheduled
Expired
Assigned
Overridden
Reconciling
Stale
Failed

Color should reinforce meaning but never be the only signal.

For example:

● Active
● Draft
● Reconciling
● Failed

with accessible text labels.

33. Loading states

Use skeletons for page-level data.

For actions:

Reconcile now
      ↓
Reconciling…

Avoid full-screen spinners for small mutations.

Explanation drawers should open immediately and load their trail independently where practical.

34. Empty states

Empty states should explain the next useful action.

Bad:

No rules.

Good:

No assignment rules yet. Create a rule to determine which employees receive this policy.

With:

[Create rule]

For employees:

No employees match these filters.

With:

[Clear filters]

35. Error handling

Errors should preserve the user's context.

Example:

Unable to save rule

The rule could not be updated because another version
was published after you opened this page.

Refresh the rule and review the latest version.

[Refresh]

Avoid generic:

Something went wrong.

For reconciliation:

Reconciliation could not be queued.

Your policy state has not been modified.

[Retry]

36. Destructive / assignment-affecting actions

Never use a generic confirmation such as:

Are you sure?

when the backend can compute the consequence.

Instead:

Disable "California Employees"?

This will affect 428 employees.

Assignments potentially removed:
• CA Meal Break Training — 428

Nothing else will change.

[Cancel] [Disable rule]

The confirmation should communicate consequences, not merely danger.

37. Accessibility

The application must support:

keyboard navigation

visible focus

semantic buttons and controls

screen-reader labels

accessible dialogs/drawers

accessible tables

sufficient contrast

non-color status indicators

logical heading hierarchy

keyboard access to command palette

escape-to-close overlays

Complex rule conditions must remain understandable without relying only on color or indentation.

38. Responsive behavior

Desktop is the primary target because this is an HR operations tool.

Mobile should remain functional but does not need to reproduce desktop information density.

Desktop

persistent navigation

dense tables

side drawers

multi-column rule editor

Tablet

collapsible navigation

reduced table columns

drawers remain preferred

Mobile

stacked employee/policy information

horizontal table scrolling only where unavoidable

rule conditions become vertical cards

explanation becomes a full-screen sheet

39. Signature user journeys

Journey A — Why does an employee have a policy?

Employees
  ↓
Search Alice
  ↓
Alice Chen
  ↓
Policies
  ↓
CA Meal Break Training
  ↓
Why?
  ↓
Explanation drawer
  ↓
Winning rule
  ↓
Matched clauses
  ↓
Losing rules
  ↓
Historical rule version

Target outcome:

The HR admin understands the decision in seconds.

Journey B — Change employee attributes safely

Employee
  ↓
Edit
  ↓
Change Department
  ↓
Preview
  ↓
Policy diff
  ↓
Review
  ↓
Save
  ↓
Reconciliation
  ↓
Updated state

Journey C — Create a policy rule

Rules
  ↓
New rule
  ↓
Select policy
  ↓
Define conditions
  ↓
Set priority
  ↓
Set effective date
  ↓
Preview matching employees
  ↓
Review
  ↓
Publish

Journey D — Investigate a conflict

Employee
  ↓
Policy
  ↓
Why?
  ↓
Explanation
  ↓
Multiple matching rules
  ↓
Compare priorities
  ↓
Winning rule
  ↓
Losing rule
  ↓
Inspect rule version

40. "Wow" features worth building

These are not decorative features. They reinforce the actual engine.

1. Why?

One-click explanation for every assignment.

2. Preview before save

Show policy consequences before employee changes commit.

3. Rule simulation

Show which employees a rule affects before publishing.

4. Near-miss explanations

Show employees who almost qualified and the exact failed condition.

5. Historical time machine

Change asOf and inspect historical policy state.

6. Rule version diff

Compare exactly what changed between rule versions.

7. Consequence-aware confirmation

Show assignment impact before destructive changes.

8. Contextual command palette

Expose domain-specific actions through Cmd/Ctrl + K.

These features demonstrate the architecture rather than hiding it.

41. Features explicitly deferred

Do not build these in the first frontend implementation unless backend support is added:

natural-language rule creation

fake AI assistant

organization-wide reconciliation dashboard

organization-wide conflict dashboard

policy coverage charts

org chart visualization

CSV export

saved views

notifications

realtime reconciliation progress

nested AND/OR conditions

bulk mutation UI

The goal is not maximum feature count.

The goal is maximum product coherence.

42. Frontend implementation phases

Phase 1 — Foundation

Build:

Next.js app

workspace integration

Tailwind

shadcn/ui

API client

authentication context

permissions

query layer

layout

navigation

global asOf

command palette foundation

Phase 2 — Employees

Build:

employee list

search/filtering

employee detail

attributes

groups

policy assignments

URL state

employee editing

Phase 3 — Explainability

Build:

explanation drawer

decision transcript

matched clauses

failed clause

losing rules

rule-version display

near-miss section

This should be treated as a major milestone.

Phase 4 — Policies

Build:

policy list

policy detail

policy rules

assigned employee view

cardinality presentation

Phase 5 — Rules

Build:

rule list

rule detail

flat condition builder

priority ordering

effective dates

rule simulation

matching employee preview

Phase 6 — Safe mutations

Build:

employee preview

rule impact preview

consequence-aware confirmations

manual overrides

reconciliation state

Phase 7 — Audit

Build:

global audit

employee audit

rule history

version comparison

historical navigation

Phase 8 — Polish

Build:

command palette refinement

keyboard shortcuts

skeletons

empty states

error states

accessibility

responsive behavior

rate-limit backoff

performance optimization

43. Acceptance criteria

The frontend should be considered successful if an HR administrator can perform the following without engineering help:

Understand

Find an employee.

See their current policies.

Understand why each policy was assigned.

See which rules matched.

See which rules lost.

See the failed clause for a near-match.

Inspect the historical rule version.

Change safely

Edit employee attributes.

Preview policy consequences.

Save the change.

Understand that reconciliation may happen asynchronously.

Configure

Create a policy rule.

Add valid conditions.

Set priority.

Set effective dates.

Preview matching employees.

Publish the rule.

Investigate

Find a policy.

See its rules.

See affected employees.

Investigate an assignment.

Inspect audit history.

Operate

Reconcile an employee.

Understand stale/reconciling state.

Retry a failed reconciliation.

Respect role permissions.

44. Engineering principles

Server is authoritative

Never reproduce policy evaluation in the browser.

The frontend renders server decisions.

Explainability is data, not decoration

The resolution trail is a domain primitive.

Do not reduce it to a generic "details" modal.

Preview is safety

Any mutation capable of changing assignments should expose its consequences whenever the backend can calculate them.

Historical correctness matters

Use asOf and rule versions consistently.

Derived state should remain derived

Do not create frontend flows that imply assignments are independently editable.

Do not fake unavailable backend capabilities

If the backend cannot support a metric, realtime state, aggregate, or bulk operation, either add the API intentionally or omit the UI.

Complexity belongs in the engine

The frontend should make deterministic policy logic understandable without duplicating it.

45. The final product feeling

The finished application should feel like an operator console for a deterministic policy engine, not an HR database.

A strong reviewer should be able to open an employee and immediately understand:

WHO
Alice Chen

WHAT
CA Meal Break Training

WHY
California Employees rule matched

HOW
state = CA
employmentType = FULL_TIME

WHY THIS RULE WON
Priority 800

WHAT ALMOST WON
Standard policy — lower priority

WHEN
Rule v3 · effective Jan 1, 2026

WHAT IF I CHANGE SOMETHING
Preview the consequence before saving

That is the central design direction.

The UI should make the sophistication of the backend visible.

