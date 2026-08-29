                         ┌──────────────┐
                         │   Admin UI   │
                         └──────┬───────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │    Express API      │
                    │                     │
                    │ Auth                │
                    │ RBAC                │
                    │ Rate limiting       │
                    │ Validation          │
                    │ REST API             │
                    └──────┬──────────────┘
                           │
             ┌─────────────┼───────────────┐
             │             │               │
             ▼             ▼               ▼
        PostgreSQL       Redis          BullMQ
             │             │               │
             │             │               ▼
             │             │        Reconciliation
             │             │           Worker
             │             │               │
             │             │               ▼
             │             │       Assignment Engine
             │             │               │
             └─────────────┴───────────────┘
                           │
                           ▼
                     Audit Events


# System Architecture

## Overview

The Policy Assignment product is designed around a synchronous API layer backed by PostgreSQL, Redis, and an asynchronous reconciliation pipeline powered by BullMQ.

The architecture separates:

* **Request handling** — Express API
* **Authentication and authorization** — API security layer
* **Durable state** — PostgreSQL
* **Fast ephemeral/cache state** — Redis
* **Asynchronous work** — BullMQ
* **Policy reconciliation** — Reconciliation Worker
* **Policy resolution** — Assignment Engine
* **Historical traceability** — Audit Events

High-level architecture:

```text
                         ┌──────────────┐
                         │   Admin UI   │
                         └──────┬───────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │    Express API      │
                    │                     │
                    │ Authentication      │
                    │ Authorization / RBAC │
                    │ Rate Limiting       │
                    │ Validation          │
                    │ REST API            │
                    └──────┬──────────────┘
                           │
             ┌─────────────┼───────────────┐
             │             │               │
             ▼             ▼               ▼
        PostgreSQL       Redis          BullMQ
             │             │               │
             │             │               ▼
             │             │        Reconciliation
             │             │           Worker
             │             │               │
             │             │               ▼
             │             │       Assignment Engine
             │             │               │
             └─────────────┴───────────────┘
                           │
                           ▼
                     Audit Events
```

---

# Architectural Responsibilities

Each component has a clear responsibility.

| Component             | Responsibility                                                                      |
| --------------------- | ----------------------------------------------------------------------------------- |
| Admin UI              | Allows company administrators to manage employees, policies, rules, and assignments |
| Express API           | Handles HTTP requests and coordinates application operations                        |
| Authentication        | Establishes the identity of the caller                                              |
| Authorization / RBAC  | Determines whether the authenticated caller can perform an operation                |
| Rate Limiting         | Protects API endpoints from excessive requests and abuse                            |
| Validation            | Ensures incoming data satisfies API and domain requirements                         |
| PostgreSQL            | Source of truth for employees, policies, rules, assignments, and audit state        |
| Redis                 | Low-latency temporary state, caching, and supporting distributed operations         |
| BullMQ                | Durable asynchronous job queue                                                      |
| Reconciliation Worker | Processes changes that may affect policy assignments                                |
| Assignment Engine     | Determines the policies that should apply to an employee                            |
| Audit Events          | Records important changes and provides historical traceability                      |

The architecture intentionally keeps these responsibilities separate so that changes in one area do not unnecessarily couple the rest of the system.

---

# 1. Admin UI

The Admin UI is the primary interface for company administrators.

Administrators should be able to use the product without understanding the underlying implementation.

Typical operations include:

* Creating and updating employees
* Viewing employee information
* Creating policies
* Creating assignment rules
* Configuring rule conditions
* Setting rule priorities
* Enabling or disabling rules
* Viewing an employee's policy assignments
* Understanding why an assignment exists
* Performing manual overrides
* Reviewing assignment changes
* Reviewing audit history

The UI communicates with the backend exclusively through the REST API.

The UI should not directly access PostgreSQL, Redis, or BullMQ.


### This is the last part of the job, first is backend ###

---

# 2. Express API

The Express API is the main application boundary.

Its responsibilities include:

1. Receiving HTTP requests
2. Authenticating the caller
3. Authorizing the requested operation
4. Rate limiting
5. Validating request input
6. Executing synchronous business operations
7. Reading and writing persistent state
8. Creating asynchronous reconciliation jobs when required
9. Returning API responses

A typical request lifecycle is:

```text
HTTP Request
     │
     ▼
Authentication
     │
     ▼
Authorization / RBAC
     │
     ▼
Rate Limiting
     │
     ▼
Request Validation
     │
     ▼
Controller
     │
     ▼
Application Service
     │
     ├──────────────► PostgreSQL
     │
     ├──────────────► Redis
     │
     └──────────────► BullMQ
```

Controllers should remain thin.

Business logic should live in application/domain services rather than being embedded directly inside Express route handlers.

---

# 3. Authentication

Authentication answers:

> "Who is making this request?"

Authentication is separate from authorization.

A user must first be identified before the system can determine what that user is allowed to do.

The API should reject requests that do not contain valid authentication credentials.

Conceptually:

```text
Request
   │
   ▼
Authentication Middleware
   │
   ├── Invalid credentials → 401 Unauthorized
   │
   ▼
Authenticated User
   │
   ▼
Authorization
```

The authenticated request should carry an identity that can be used by downstream authorization and audit logic.

For example:

```text
userId
organizationId
roles
```

The exact authentication provider or mechanism can be changed independently of the rest of the application as long as it produces a trusted authenticated identity.

Authentication must not be confused with user-provided request data.

The server should derive the organization and identity from the authenticated context rather than trusting arbitrary organization IDs supplied by clients.

---

# 4. Authorization and RBAC

Authorization answers:

> "Is this authenticated user allowed to perform this operation?"

The product should use role-based access control where appropriate.

Example roles:

```text
Company Admin
HR Admin
Manager
Employee
```

Different roles can have different permissions.

For example:

```text
Company Admin
├── Manage employees
├── Manage policies
├── Manage rules
├── Manage assignments
├── Perform overrides
└── View audit history

HR Admin
├── Manage employees
├── View assignments
└── Manage selected policies

Manager
├── View relevant employees
└── View relevant assignments

Employee
└── View own information
```

The exact permission matrix should be defined by product requirements rather than scattered throughout route handlers.

Prefer explicit permissions such as:

```text
employee:read
employee:write
policy:read
policy:write
rule:read
rule:write
assignment:read
assignment:override
audit:read
```

over checking role names throughout the application.

This allows roles and permissions to evolve independently.

---

## Organization Isolation

Warp is multi-tenant.

A user belonging to Organization A must not be able to read or modify resources belonging to Organization B.

Organization context must therefore be enforced server-side.

Every organization-scoped query should constrain access to the authenticated user's organization.

Conceptually:

```text
Authenticated User
        │
        ▼
organizationId = X
        │
        ▼
All authorized database operations
        │
        ▼
WHERE organization_id = X
```

The organization should never be selected solely from an arbitrary request parameter.

This is a critical security boundary.

---

# 5. Rate Limiting

Rate limiting protects the API from:

* Accidental request floods
* Malicious abuse
* Excessive repeated requests
* Expensive endpoint abuse
* Resource exhaustion

Redis is suitable for implementing distributed rate limiting because multiple API instances can share the same rate-limit state.

Conceptually:

```text
Request
   │
   ▼
Rate Limiter
   │
   ├── Limit exceeded → 429 Too Many Requests
   │
   ▼
Continue request
```

Rate limits can be applied at different levels depending on the endpoint:

* Per user
* Per organization
* Per IP
* Per endpoint
* Per authenticated identity

Expensive operations should generally have stricter limits than simple reads.

---

# 6. Request Validation

Validation protects the application from malformed or invalid input.

Validation should happen before domain operations are executed.

Examples:

```text
Create Employee
├── name required
├── email valid
├── department valid
└── employment type valid

Create Rule
├── policy required
├── conditions valid
├── priority valid
└── effective dates valid
```

Validation should distinguish between:

### Structural Validation

Does the request have the correct shape?

Example:

```text
priority must be an integer
email must be a valid email
```

### Domain Validation

Is the request valid according to product rules?

Example:

```text
A rule cannot reference a policy belonging to another organization.
```

### Database Constraints

Does the data satisfy persistence-level invariants?

Example:

```text
unique constraints
foreign keys
non-null constraints
```

The application should use all three layers where appropriate.

---

# 7. PostgreSQL

PostgreSQL is the durable source of truth.

It stores the state required to understand the current and historical state of policy assignments.

This includes entities such as:

```text
Employee
Organization
Policy
Policy Category
Policy Rule
Assignment
Audit Event
```

PostgreSQL is responsible for:

* Durable persistence
* Referential integrity
* Transactions
* Unique constraints
* Foreign keys
* Querying employee populations
* Querying applicable rules
* Persisting assignments
* Persisting historical state
* Supporting auditability

The relational model is well suited to the domain because policy assignment contains many relationships and strong consistency requirements.

---

# 8. Transactions

Operations that modify multiple pieces of related state should use PostgreSQL transactions where atomicity is required.

For example, creating a rule may involve:

```text
Create Rule
     +
Create Rule Conditions
     +
Create Audit Event
```

These operations should not leave the database in a partially updated state.

Conceptually:

```text
BEGIN TRANSACTION

Create Rule
Create Conditions
Create Audit Event

COMMIT
```

If any operation fails:

```text
ROLLBACK
```

This ensures that durable state remains internally consistent.

---

# 9. Redis

Redis is used for fast, temporary, or coordination-oriented state.

Redis should not become the source of truth for core employee, policy, rule, or assignment data.

Appropriate uses include:

* API rate limiting
* Caching frequently accessed data
* Distributed coordination
* Short-lived state
* BullMQ's underlying queue infrastructure

If cached data becomes unavailable, the system should be able to reconstruct it from PostgreSQL.

This establishes a clear rule:

> PostgreSQL owns durable truth; Redis accelerates or coordinates access to that truth.

---

# 10. BullMQ

BullMQ provides the asynchronous job processing layer.

Policy reconciliation can involve many employees and rules and may therefore be unsuitable for synchronous HTTP request execution.

Instead of making an API request wait for potentially expensive reconciliation:

```text
PATCH Employee
     │
     ▼
API
     │
     ▼
Persist employee change
     │
     ▼
Create reconciliation job
     │
     ▼
Return response
```

The actual reconciliation happens asynchronously.

BullMQ uses Redis as its underlying queue/storage mechanism.

---

# 11. Why Asynchronous Reconciliation?

Consider changing an employee's department:

```text
Engineering → Sales
```

That change could affect:

* Vacation policy
* Expense policy
* Equipment stipend
* Application access
* Compliance training
* Other assignments

Recalculating everything synchronously could make the API request slow.

Instead:

```text
Employee Update
      │
      ▼
PostgreSQL
      │
      ▼
Reconciliation Job
      │
      ▼
BullMQ
      │
      ▼
Worker
```

The API remains responsive while the assignment state is reconciled asynchronously.

---

# 12. Reconciliation Worker

The Reconciliation Worker consumes jobs from BullMQ.

Its responsibility is to determine which employees or assignments may have become stale and bring them back into the correct state.

Possible reconciliation triggers include:

```text
Employee attribute changed
Rule changed
Rule priority changed
Rule enabled/disabled
Rule effective date changed
Group membership changed
Policy changed
Manual override changed
```

The worker should avoid blindly recalculating the entire organization whenever a single input changes.

Instead, it should determine the affected population where possible.

Example:

```text
Department changed
        │
        ▼
Affected employee
        │
        ▼
Find rules depending on Department
        │
        ▼
Reconcile relevant assignments
```

This keeps reconciliation efficient as the organization grows.

---

# 13. Assignment Engine

The Assignment Engine contains the core policy-resolution logic.

Its responsibility is to answer:

> "Given an employee and a point in time, which policies should apply?"

Conceptually:

```text
Employee
   │
   ▼
Employee Context
   │
   ▼
Find Matching Rules
   │
   ▼
Filter by Effective Date
   │
   ▼
Apply Rule Priority
   │
   ▼
Resolve Cardinality Conflicts
   │
   ▼
Apply Manual Overrides
   │
   ▼
Final Policy Assignments
```

The engine should be deterministic.

Given the same:

```text
Employee state
+
Rule state
+
Policy state
+
Point in time
```

it should produce the same result.

This makes the system easier to test, debug, reconcile, and explain.

---

# 14. Assignment Resolution

Rules may overlap.

Example:

```text
Rule A:
All employees → Standard Vacation

Rule B:
Engineering → Engineering Vacation

Rule C:
Employees with 5+ years → Senior Vacation
```

An employee could satisfy all three.

The Assignment Engine must apply a deterministic resolution strategy.

Resolution should account for:

* Rule priority
* Policy category cardinality
* Effective dates
* Manual overrides
* Enabled/disabled rules
* Other domain-specific constraints

The resolution process should produce not only the resulting assignment but enough information to explain the decision.

---

# 15. Explainability

The Assignment Engine should preserve the reasoning behind an assignment.

A useful conceptual result is:

```text
Assignment
├── employee
├── policy
├── category
├── effective period
├── source
└── explanation
      ├── matching rule
      ├── matched conditions
      ├── priority
      └── conflict resolution
```

This allows the product to answer:

> "Why does Employee X have Policy Y?"

For example:

```text
Employee:
Alice

Policy:
California Meal Break Training

Reason:
Employee state = California

Matched rule:
California Compliance Rule

Priority:
80
```

If multiple rules matched:

```text
3 rules matched.

Winning rule:
Executive Vacation Rule

Reason:
Priority 100 > 50 > 10
```

Explainability should be a first-class concern rather than something reconstructed from logs after the fact.

---

# 16. Audit Events

Important changes produce audit events.

Examples:

```text
EmployeeCreated
EmployeeUpdated
RuleCreated
RuleUpdated
RuleDisabled
RulePriorityChanged
AssignmentCreated
AssignmentRemoved
AssignmentChanged
ManualOverrideCreated
ManualOverrideRemoved
```

Audit events should capture enough information to answer:

* Who made the change?
* What changed?
* When did it change?
* Which organization was affected?
* What was the previous state?
* What is the new state?
* What caused an assignment to change?

Conceptually:

```text
Audit Event

actor
organization
action
entity
entity_id
timestamp
before
after
reason / metadata
```

Audit data should be durable and should not depend on Redis.

---

# 17. Audit Event Flow

A state-changing operation can follow this pattern:

```text
Admin
  │
  ▼
Express API
  │
  ├── Authentication
  ├── Authorization
  ├── Validation
  │
  ▼
Application Service
  │
  ▼
PostgreSQL Transaction
  │
  ├── Update state
  └── Record audit event
  │
  ▼
Commit
  │
  ▼
Queue reconciliation job if required
```

The durable state change and its audit record should be consistent.

If the operation succeeds but its audit record disappears, the product loses an important part of its traceability.

---

# 18. End-to-End Example: Employee Attribute Change

Suppose an employee changes location:

```text
California → Texas
```

The request flows through the system:

```text
Admin UI
   │
   ▼
PATCH /employees/:id
   │
   ▼
Authentication
   │
   ▼
Authorization
   │
   ▼
Validation
   │
   ▼
Employee Service
   │
   ├──────────────► PostgreSQL
   │                 │
   │                 ├── Update employee
   │                 └── Record audit event
   │
   ▼
Create Reconciliation Job
   │
   ▼
BullMQ
   │
   ▼
Reconciliation Worker
   │
   ▼
Assignment Engine
   │
   ├── Find affected rules
   ├── Evaluate rules
   ├── Resolve conflicts
   └── Calculate desired assignments
   │
   ▼
PostgreSQL
   │
   ├── Create new assignments
   ├── Remove stale assignments
   └── Record assignment changes
   │
   ▼
Final consistent state
```

The API does not need to wait for the complete reconciliation process.

---

# 19. End-to-End Example: Rule Change

Suppose an administrator changes:

```text
Rule:
Engineering employees receive Policy A
```

to:

```text
Rule:
Engineering employees receive Policy B
```

The flow becomes:

```text
Admin UI
   │
   ▼
Express API
   │
   ▼
Authentication
   │
   ▼
Authorization
   │
   ▼
Validation
   │
   ▼
PostgreSQL
   │
   ├── Update rule
   └── Record audit event
   │
   ▼
BullMQ
   │
   ▼
Reconciliation Worker
   │
   ▼
Find employees affected by rule
   │
   ▼
Assignment Engine
   │
   ▼
Calculate desired assignments
   │
   ▼
Persist assignment changes
   │
   ▼
Record audit events
```

Only employees affected by the changed rule should need reconciliation where the system can determine that population efficiently.

---

# 20. Failure Handling

Asynchronous reconciliation must be resilient to failures.

A worker may fail because of:

* Temporary database errors
* Redis failures
* Application errors
* Unexpected rule data
* Network failures

BullMQ should be configured to support retry behavior for recoverable failures.

Conceptually:

```text
Job
 │
 ▼
Worker
 │
 ├── Success → Complete
 │
 └── Failure
       │
       ▼
    Retry
       │
       ├── Success → Complete
       │
       └── Repeated failure → Failed Job
```

Retries should be designed carefully so that processing the same reconciliation job multiple times does not produce incorrect assignments.

This means reconciliation should be **idempotent**.

---

# 21. Idempotent Reconciliation

Running reconciliation twice should produce the same final state as running it once.

For example:

```text
Desired assignments:
A, B, C

Current assignments:
A, C, D
```

Reconciliation determines:

```text
Add B
Remove D
Keep A
Keep C
```

After the first run:

```text
A, B, C
```

Running the same reconciliation again should produce no additional changes.

This is important because distributed systems can retry jobs.

Idempotency makes retries safe.

---

# 22. Concurrency

Multiple changes may happen at approximately the same time.

For example:

```text
Employee changes department
        +
Admin changes rule
```

Both changes may trigger reconciliation.

The system should ensure that the final assignment state reflects the latest valid input state.

Useful mechanisms include:

* PostgreSQL transactions
* Optimistic concurrency where appropriate
* Deterministic resolution
* Idempotent reconciliation
* Job deduplication/coalescing where useful
* Versioning of rules or employee state

The exact concurrency strategy should follow the domain requirements documented in `docs/notes.md` and `docs/db.md`.

---

# 23. Caching Strategy

Redis may cache frequently accessed data, but cached values must be treated as derived data.

Potential candidates include:

* Frequently accessed policy metadata
* Rule metadata
* Employee population lookups
* Read-heavy API responses

Cache invalidation should happen when the underlying PostgreSQL state changes.

The system should always have a safe fallback to PostgreSQL.

Avoid placing business-critical truth exclusively in Redis.

---

# 24. Scaling

The architecture allows the API and workers to scale independently.

### API Scaling

Multiple Express instances can run behind a load balancer:

```text
                 Load Balancer
                 /     |     \
                /      |      \
          API #1     API #2     API #3
             \         |         /
              \        |        /
                 PostgreSQL
```

Redis provides shared state where required.

### Worker Scaling

Multiple reconciliation workers can consume jobs from BullMQ:

```text
                 BullMQ
                /      \
               /        \
       Worker #1      Worker #2
           │              │
           └──────┬───────┘
                  ▼
             PostgreSQL
```

This allows reconciliation throughput to increase independently of HTTP traffic.

---

# 25. Read and Write Characteristics

The architecture distinguishes between read-heavy and write-heavy workloads.

### Reads

Common reads include:

* Employee assignments
* Employee policies
* Applicable policies
* Rule configuration
* Assignment explanations
* Audit history

These should be optimized through PostgreSQL indexes and, where useful, Redis caching.

### Writes

Writes include:

* Employee changes
* Rule changes
* Policy changes
* Assignment changes
* Manual overrides

Writes require stronger consistency and should primarily use PostgreSQL.

### Reconciliation

Reconciliation is potentially compute-intensive and should be decoupled from user-facing HTTP requests through BullMQ.

---

# 26. Architectural Principles

The system follows several principles.

### PostgreSQL is the source of truth

Core business state belongs in PostgreSQL.

### Redis is not the source of truth

Redis is used for performance and coordination.

### API requests should remain responsive

Expensive reconciliation should happen asynchronously.

### Assignment resolution is deterministic

The same inputs should produce the same assignments.

### Reconciliation is idempotent

Retrying a job must be safe.

### Security is enforced at the API boundary

Authentication and authorization happen before business operations.

### Tenant isolation is mandatory

Organization boundaries must be enforced server-side.

### Auditability is first-class

Important state changes must be traceable.

### Business logic is separated from transport

Express controllers should not contain the core policy-resolution logic.

### Infrastructure should remain replaceable

The Assignment Engine and domain logic should not be tightly coupled to Express, Redis, or BullMQ APIs.

---

# 27. Recommended Application Structure

A conceptual application structure is:

```text
src/
├── api/
│   ├── routes/
│   ├── controllers/
│   ├── middleware/
│   │   ├── authentication
│   │   ├── authorization
│   │   ├── rateLimit
│   │   └── validation
│   └── schemas/
│
├── domain/
│   ├── employee/
│   ├── policy/
│   ├── rule/
│   ├── assignment/
│   └── audit/
│
├── application/
│   ├── employee/
│   ├── policy/
│   ├── rule/
│   ├── assignment/
│   └── reconciliation/
│
├── workers/
│   └── reconciliation/
│
├── infrastructure/
│   ├── database/
│   ├── redis/
│   └── queues/
│
└── shared/
    ├── errors/
    ├── logging/
    └── utilities/
```

I am initializing monorepo so that shared folder might be in packages as well as the db folder  

The exact directory structure may evolve, but the separation of responsibilities should remain clear.

---

# 28. Core Architectural Flow

The central product flow can be summarized as:

```text
                 Employee / Rule Change
                          │
                          ▼
                    Express API
                          │
                ┌─────────┴─────────┐
                │                   │
                ▼                   ▼
           PostgreSQL             Audit
                │
                ▼
             BullMQ
                │
                ▼
       Reconciliation Worker
                │
                ▼
        Assignment Engine
                │
                ▼
          Desired State
                │
                ▼
           PostgreSQL
                │
                ▼
          Audit Events
```

The important distinction is:

> The API records authoritative input changes; asynchronous reconciliation computes the resulting policy assignments.

This separation keeps user-facing operations responsive while allowing the assignment system to handle potentially large populations efficiently.

---

# 29. Architectural Tradeoffs

## PostgreSQL vs. Graph Database

A graph database could naturally represent employee-policy relationships, but PostgreSQL is preferable for this product because the domain also requires:

* Strong transactional guarantees
* Structured relational data
* Constraints
* Effective dates
* Audit history
* Attribute-based filtering
* Mature indexing
* Operational simplicity

The relationships are significant, but they do not inherently require a graph database.

## Synchronous vs. Asynchronous Resolution

Resolving assignments synchronously gives immediate consistency to the API response but can make employee or rule updates expensive.

Asynchronous reconciliation provides:

* Responsive API requests
* Independent worker scaling
* Retry support
* Better handling of large affected populations

The tradeoff is that assignment state may be temporarily stale immediately after an input change.

The product should make this state transition understandable and reconciliation should converge reliably.

## Redis

Redis improves latency and provides shared infrastructure for rate limiting and queues, but introduces another operational dependency.

Therefore Redis should remain outside the authoritative data path for core business state.

## BullMQ

BullMQ adds asynchronous processing complexity but is valuable because reconciliation is naturally a background workload.

It also provides retry and job-management capabilities that would otherwise need to be implemented manually.

---

# 30. Key Invariants

The following invariants should hold regardless of implementation details:

1. A user cannot access another organization's data.
2. Unauthorized users cannot modify protected resources.
3. Core business state is durably stored.
4. Policy resolution is deterministic.
5. Cardinality constraints are always respected.
6. Historical assignment state remains explainable.
7. Reconciliation converges toward the correct assignment state.
8. Reconciliation is safe to retry.
9. Important state changes are auditable.
10. Expensive reconciliation does not unnecessarily block user-facing API requests.
11. Redis failure should not destroy authoritative business state.
12. Assignment logic should remain independently testable from HTTP and infrastructure concerns.
