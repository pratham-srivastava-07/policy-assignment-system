# Frontend Product Research & Architecture Task

You are acting as a **senior product engineer + staff frontend engineer + product designer**.

You are working inside the repository:

`policy-assignment-system`

This is an HR / People Ops policy assignment platform inspired by the idea of a "system of intelligence for a company's people."

The core problem:

> Given employees, policies, groups, and assignment rules, determine which policies apply to which employees. The system must handle conflicts deterministically, reconcile assignments when employee/rule/group data changes, and make every assignment explainable and auditable.

The backend is an npm-workspaces monorepo:

```text
apps/api        — API service
apps/worker     — background reconciliation worker
packages/*      — shared, db, core packages
docs/           — product/system/database documentation
infra/          — infrastructure
CLAUDE.md       — project context
background.md   — original challenge
```

The backend uses TypeScript + Prisma and separates API and worker responsibilities.

---

# YOUR JOB

Do NOT immediately write frontend code.

First, understand the product completely and perform deep product/UX research.

The final goal is to determine:

> "If an exceptionally strong startup engineering team were building the frontend for this exact system today, what would they build?"

I want something that feels like a real product used by HR/People Ops teams — not a generic admin dashboard.

---

# PHASE 1 — UNDERSTAND THE EXISTING SYSTEM

Read ALL relevant repository documentation and source code.

Start with:

* CLAUDE.md
* background.md
* docs/notes.md
* docs/architecture.md
* docs/db.md
* all Prisma schemas/migrations
* API routes/controllers/services
* core policy/rule evaluation logic
* reconciliation worker
* shared types
* tests

Build a mental model of:

1. Employee
2. Organization
3. Policy
4. Policy category
5. Assignment rule
6. Policy assignment
7. Rule conditions
8. Rule priority
9. Conflict resolution
10. Reconciliation
11. Effective dates
12. Versioning
13. Auditability
14. Explainability
15. Groups
16. Employee state changes

Determine what the backend can actually do today.

IMPORTANT:

Do not invent backend capabilities.

Separate:

* implemented
* partially implemented
* planned
* missing

---

# PHASE 2 — DISCOVER THE PRODUCT MODEL

From the code and docs, answer:

### Who uses this?

Identify likely personas such as:

* People Ops administrator
* HR administrator
* HRBP
* Benefits administrator
* Operations administrator
* employee / manager if relevant

Determine which persona should be the primary user for the MVP.

### What are their jobs-to-be-done?

For example:

* create a policy
* create an assignment rule
* understand who receives a policy
* inspect why an employee received a policy
* identify employees missing a policy
* understand conflicts
* preview the effect of changing a rule
* reconcile stale assignments
* audit historical decisions
* disable/expire a rule
* inspect employee policy state

Don't assume these are correct. Derive them from the repository.

---

# PHASE 3 — RESEARCH REAL PRODUCTS

Use web research extensively.

Research how excellent modern products solve adjacent problems.

Look at products including, but not limited to:

* Rippling
* Deel
* Gusto
* Workday
* Lattice
* BambooHR
* HiBob
* Personio
* Ramp
* Brex
* Linear
* Vercel
* Stripe
* Notion
* Retool
* Palantir
* Datadog

Also investigate newer AI-native/admin products and modern B2B SaaS interfaces.

Do NOT simply copy their visual style.

Study their:

* information architecture
* navigation
* entity pages
* tables
* filters
* search
* command palettes
* rule builders
* detail drawers
* timelines
* activity feeds
* audit logs
* status indicators
* empty states
* bulk actions
* confirmation flows
* destructive actions
* preview/dry-run experiences
* permission models
* error states
* loading states
* responsive behavior

Pay particular attention to products dealing with:

* rules
* automation
* policies
* permissions
* people
* assignments
* configuration
* auditability

---

# PHASE 4 — RESEARCH "CRAZY GOOD" ENGINEERING

Search GitHub and the web for exceptional open-source frontend implementations.

Find examples of production-quality applications using:

* Next.js
* React
* TypeScript
* Tailwind
* shadcn/ui
* Radix
* TanStack Table
* TanStack Query
* Zustand
* React Hook Form
* Zod

Look for real repositories rather than tutorial projects.

Study how strong developers structure:

* app routes
* feature modules
* components
* forms
* tables
* filters
* query state
* URL state
* API clients
* loading states
* optimistic updates
* error handling
* modals
* drawers
* command menus
* reusable primitives
* design systems

Identify patterns worth adopting.

---

# PHASE 5 — DESIGN THE PRODUCT INFORMATION ARCHITECTURE

Based on the actual backend capabilities, design the frontend IA.

Consider something along the lines of:

```text
Dashboard
Employees
Policies
Rules
Assignments
Groups
Reconciliation
Audit Log
Settings
```

But DO NOT blindly use this structure.

Determine the optimal navigation based on user workflows.

For each section explain:

* purpose
* primary user
* key actions
* important metrics
* tables
* filters
* detail pages
* secondary actions
* empty states

---

# PHASE 6 — DESIGN THE CORE SCREENS

Design the complete UX for the important workflows.

At minimum investigate:

## Dashboard

What should an HR admin see immediately?

Possible signals:

* employees
* active policies
* active rules
* pending reconciliation
* assignment changes
* conflicts
* failed evaluations
* stale assignments
* recent activity

Determine which metrics are actually useful.

---

## Employees

Design:

### Employee list

Need to consider:

* search
* filters
* department
* state
* tenure
* role
* group
* policy status
* assignment status

### Employee detail

This is extremely important.

Design a page that lets the operator understand:

```text
Employee
 ├── Profile
 ├── Attributes
 ├── Groups
 ├── Assigned Policies
 ├── Assignment Reasoning
 ├── Assignment History
 └── Audit Timeline
```

The user should be able to answer:

> "Why does this employee have this policy?"

in seconds.

---

# PHASE 7 — POLICY EXPERIENCE

Design:

### Policy list

Show useful information such as:

* policy name
* category
* status
* number of assigned employees
* assignment source
* effective date
* last updated
* version

### Policy detail

Design a powerful detail page.

Potential structure:

```text
Policy
 ├── Overview
 ├── Rules
 ├── Assigned Employees
 ├── Coverage
 ├── Conflicts
 ├── History
 └── Audit
```

The page should make policy configuration understandable.

---

# PHASE 8 — RULE BUILDER

This is one of the most important parts of the product.

Research how products like:

* Stripe
* Segment
* Zapier
* Retool
* Workday
* Rippling
* Salesforce

represent conditional logic.

Design a rule builder for conditions such as:

```text
STATE = CA
AND
TENURE >= 5 years
AND
GROUP contains "Engineering"
```

Consider:

* nested AND/OR conditions
* condition groups
* operators
* typed values
* validation
* previews
* priority
* enabled/disabled state
* effective dates
* versioning

The rule builder must not feel like a developer tool.

It should feel approachable to an HR administrator.

---

# PHASE 9 — THE MOST IMPORTANT FEATURE: EXPLAINABILITY

Design an "Explain this assignment" experience.

For example:

```text
Why does Alice have California Meal Break Training?

✓ Employee state = California
✓ Rule "California Employees" matched
✓ Rule priority = 10
✓ Policy = CA Meal Break Training
✓ Assignment created at 09:42
```

For a conflict:

```text
2 rules matched

✓ Rule A — Priority 10
✕ Rule B — Priority 20

Rule A won because it has higher precedence.
```

Design this as a first-class product feature.

Research how systems such as:

* Stripe
* AWS
* Cloudflare
* Datadog
* GitHub Actions
* feature flag systems
* authorization systems

make complex decisions explainable.

---

# PHASE 10 — RECONCILIATION UX

The worker performs asynchronous reconciliation.

The frontend therefore needs to represent this correctly.

Design:

* reconciliation status
* pending changes
* running state
* completed state
* failures
* retry
* last successful reconciliation
* affected employees
* affected policies
* change summary

Potential experience:

```text
Reconciliation

1,284 employees evaluated

+ 82 assignments added
- 31 assignments removed
~ 17 assignments changed

3 conflicts detected
0 failures

Completed 2 minutes ago
```

Also determine whether the UI needs:

* dry-run
* preview
* "reconcile now"
* bulk reconciliation
* reconciliation history

---

# PHASE 11 — AUDITABILITY

Design a real audit experience.

The user should be able to answer:

> Who changed what, when, why, and what effect did it have?

Design:

* audit timeline
* actor
* timestamp
* entity
* previous value
* new value
* reason
* resulting assignments

Consider immutable event-style presentation.

---

# PHASE 12 — INTERACTION DESIGN

Don't only design static pages.

Define:

* keyboard shortcuts
* command palette
* global search
* URL-driven filters
* bulk selection
* bulk actions
* drawers
* modals
* inline editing
* optimistic updates
* confirmation dialogs
* undo where appropriate
* toast notifications
* skeleton loading
* empty states
* error states
* permission-denied states

Determine where each interaction belongs.

---

# PHASE 13 — VISUAL SYSTEM

Research modern B2B SaaS design systems.

Create a proposed design language.

Define:

* typography
* spacing
* border radius
* shadows
* density
* table density
* colors
* semantic status colors
* badges
* icons
* buttons
* inputs
* dropdowns
* command menus
* cards
* drawers
* modals

The product should feel:

* serious
* premium
* technical
* trustworthy
* enterprise-ready
* information-dense without being overwhelming

Avoid:

* excessive gradients
* generic SaaS landing-page aesthetics
* giant cards
* unnecessary animations
* dashboard-with-12-cards syndrome
* fake AI decoration

---

# PHASE 14 — FRONTEND ARCHITECTURE

Based on the existing backend, propose the frontend architecture.

Assume:

* Next.js
* React
* TypeScript
* Tailwind
* shadcn/ui
* TanStack Query
* TanStack Table
* React Hook Form
* Zod

But do not blindly adopt these.

Explain what should actually be used.

Design the folder structure.

For example:

```text
apps/web/

app/
components/
features/
lib/
hooks/
api/
types/
```

Determine whether feature-based architecture is better.

Design:

```text
features/
  employees/
  policies/
  rules/
  assignments/
  reconciliation/
  audit/
```

For each feature define:

* pages
* components
* hooks
* API functions
* schemas
* types
* state
* tests

---

# PHASE 15 — API CONTRACT REQUIREMENTS

The repository currently notes that `apis.md` is pending.

Use everything you learned from the backend and frontend UX research to produce the requirements for `docs/apis.md`.

DO NOT invent endpoints that conflict with the backend.

First identify the API capabilities that the frontend genuinely needs.

For every endpoint specify:

```text
Method
Path
Purpose
Authentication
Request
Response
Query parameters
Pagination
Filtering
Sorting
Errors
Side effects
Idempotency
```

Include APIs required for:

* employees
* policies
* policy categories
* rules
* assignments
* explanation
* reconciliation
* audit logs
* groups
* dashboard/metrics

Clearly distinguish:

### Existing backend endpoint

from

### Required endpoint

from

### Optional/future endpoint

---

# PHASE 16 — BUILD A FRONTEND PRODUCT SPEC

Produce a document:

`docs/frontend.md`

It must contain:

1. Product philosophy
2. Personas
3. Jobs-to-be-done
4. Information architecture
5. Navigation
6. Screen inventory
7. Detailed screen specifications
8. User flows
9. Rule-builder UX
10. Explainability UX
11. Reconciliation UX
12. Audit UX
13. Component system
14. Interaction patterns
15. Loading/error/empty states
16. Accessibility requirements
17. Responsive strategy
18. Frontend architecture
19. State-management strategy
20. API consumption strategy
21. Testing strategy
22. Implementation phases

---

# PHASE 17 — PRODUCE UI WIREFRAMES IN TEXT

For every major screen, create a textual wireframe.

Example:

```text
┌──────────────────────────────────────────────────────────────┐
│ Policy Assignment                         Search   Command ⌘K │
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│ Overview     │ Policies                         + New Policy │
│ Employees    │                                               │
│ Policies     │ [Search] [Category] [Status] [More Filters]  │
│ Rules        │                                               │
│ Assignments  │ ┌───────────────────────────────────────────┐ │
│ Reconcile    │ │ Policy              Rules   Employees     │ │
│ Audit        │ ├───────────────────────────────────────────┤ │
│              │ │ CA Meal Break       2       1,284         │ │
│              │ │ 401k Match          4       2,938         │ │
│              │ └───────────────────────────────────────────┘ │
└──────────────┴───────────────────────────────────────────────┘
```

Do this for all major screens.

---

# PHASE 18 — FIND THE "WOW" FEATURES

Think like a startup product team.

Identify 5–10 experiences that would make this product feel substantially better than a normal CRUD HR application.

Examples to investigate:

* "Why does this employee have this policy?"
* policy coverage visualization
* rule simulation
* "What changes if I publish this rule?"
* affected employee preview
* conflict explanation
* assignment timeline
* reconciliation diff
* natural-language rule creation
* command palette
* global search
* keyboard-driven workflows

Do not add gimmicks.

Only recommend features that reinforce the core product.

---

# PHASE 19 — IMPLEMENTATION PLAN

After the research and product design, create a phased implementation plan:

### Phase 1

Foundation

### Phase 2

Employees

### Phase 3

Policies

### Phase 4

Rules

### Phase 5

Assignments + explainability

### Phase 6

Reconciliation

### Phase 7

Audit

### Phase 8

Polish

For every phase list:

* files to create
* components
* API dependencies
* backend dependencies
* tests
* acceptance criteria

---

# IMPORTANT CONSTRAINTS

1. Do not build a generic HR dashboard.
2. Do not invent backend functionality without clearly labeling it.
3. Do not copy another company's UI.
4. Prioritize workflows over visual decoration.
5. Explain every major UX decision.
6. Prefer information density where it helps operators.
7. Make complex policy decisions understandable to non-engineers.
8. Treat explainability and auditability as core product primitives.
9. Treat reconciliation as a first-class system state.
10. Make the UI demonstrate the sophistication of the backend.

---

# FINAL DELIVERABLES

After completing the investigation, produce:

```text
docs/frontend.md
docs/apis.md
docs/frontend-research.md
```

And provide a final summary containing:

1. What the product actually is
2. Who should use it
3. What the frontend should look like
4. The 10 most important screens
5. The 10 most important interactions
6. The strongest product ideas discovered
7. The recommended frontend stack
8. The recommended architecture
9. Missing backend capabilities required by the frontend
10. The implementation order

Finally answer:

> "If I were being evaluated by a strong Warp engineering team, what would make this frontend look like it was built by an exceptional engineer rather than someone completing an assignment?"

Be opinionated.

Do not optimize for the easiest implementation.

Optimize for **demonstrating engineering judgment, product thinking, system understanding, and frontend craftsmanship.**
