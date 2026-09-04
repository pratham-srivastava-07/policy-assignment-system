# CLAUDE.md

## Product Context

Warp is the system of intelligence for a company's people.

Companies use Warp to manage the lifecycle and day-to-day operations of their employees, including:

* Sending offers
* Employee onboarding
* Payroll and compensation
* IT and application access
* Time off
* Expenses
* Timesheets
* Org charts
* Benefits
* Work schedules
* Device fleets
* Compliance
* Other people and workforce operations

Companies use internal policies to govern how these areas work.

Examples include:

* Which employees receive a particular time-off policy
* Which applications an employee can access
* Which employees are required to complete compliance training
* Which pay schedule applies to an employee
* Which benefits an employee is eligible for
* Which work schedule or shift policy applies to an employee
* Which manager an employee reports to

---

## Product Documentation

Detailed product and implementation knowledge is maintained in the `docs/` directory.

**Before making decisions or changes related to the policy assignment product, read the relevant documentation in `docs/`.**

The primary documents are:

### `docs/notes.md`

Contains detailed product/domain notes and requirements.

Use this document to understand:

* Product requirements
* Domain behavior
* Functional requirements
* Business rules
* Edge cases
* Expected behavior
* Product decisions and context

### `docs/architecture.md`

Contains the detailed system architecture.

Use this document to understand:

* System architecture
* Components and responsibilities
* Data flow
* Processing patterns
* Infrastructure decisions
* Scaling considerations
* Reliability considerations
* Architectural tradeoffs

### `docs/db.md`

Contains the detailed database design.

Use this document to understand:

* Database schema
* Tables and relationships
* Constraints
* Indexes
* Data modeling decisions
* Persistence behavior
* Database-specific considerations

### Documentation precedence

When detailed information is required, consult the relevant document rather than making assumptions.

Use:

```text
Product/domain question
        ↓
docs/notes.md

Architecture/system question
        ↓
docs/architecture.md

Database/schema question
        ↓
docs/db.md
```

If these documents contain more specific information than this file, prefer the detailed documentation for implementation decisions.

This file provides the high-level product context and terminology; the documents in `docs/` contain the deeper project-specific knowledge.

---

## Policy Assignments

A core concept in Warp is the relationship between an employee and a policy that applies to them.

This relationship is called a **policy assignment**.

A policy assignment answers:

> "Which policy applies to this employee, and why?"

Employees can have many policy assignments across different areas of the product.

Examples:

### Time Off

An employee may have:

* Vacation policy
* Sick leave policy
* Maternity leave policy

### Pay

An employee may have:

* Weekly pay schedule
* Bi-weekly pay schedule
* Semi-monthly pay schedule
* Monthly pay schedule

### Work

An employee may have:

* Work schedule
* Shift policy
* Overtime policy
* Physical clock-in location requirements
* Holiday calendar

### Benefits

An employee may have:

* Healthcare plan
* Retirement plan
* Commuter benefit
* Gym stipend
* Other benefit plans

### Access

An employee may have access to:

* GitHub
* Slack
* Jira
* Salesforce
* Other company applications

### Compliance

An employee may be required to complete:

* Workplace harassment training
* Security training
* Location-specific compliance training
* Other company-required training

### Organization

An employee may have:

* A manager
* Organizational relationships
* Group memberships

---

## How Policies Apply

Policy assignments are generally determined by information associated with an employee.

The employee's context can include:

* Employment type
* Location
* State or country
* Department
* Role
* Tenure
* Managerial status
* Organization/group membership
* Other employee attributes

Companies define rules that determine which policies apply to which employees.

### Examples

#### Employment Type

> Hourly US W-2 employees receive a specific shift tracking policy.

#### Location

> Employees residing in California must complete the California Meal Break policy.

#### Tenure

> Employees who reach two years of tenure become eligible for a more generous time-off policy.

#### Department

> Engineering employees receive a monitor and keyboard stipend.

#### Org Chart

> Managers must complete additional sexual harassment training.

#### Manual Override

> Always pay this contractor monthly, regardless of other applicable rules.

Rules may therefore be automatic, attribute-based, organizational, or explicitly manual.

---

## Policy Assignment Categories

Policies can have different assignment cardinalities.

The cardinality of a policy category determines how many policies an employee can have in that category.

### Single Assignment

Some categories allow only one applicable policy per employee.

Examples:

* Manager
* Pay schedule
* Work schedule
* Holiday calendar
* A particular time-off policy category

For example:

> An employee cannot have two active pay schedules at the same time.

Multiple employees may reference the same policy or manager.

### Multiple Assignments

Other categories allow an employee to have multiple policies simultaneously.

Examples:

* Application access
* Groups
* Compliance trainings
* Benefits where multiple plans are allowed

For example:

> An employee can have access to GitHub, Slack, Jira, and other applications simultaneously.

The product must preserve the intended cardinality of each policy category.

---

## Rules

A rule describes when a policy should apply to employees.

Rules may use one or more employee attributes or relationships.

Common rule dimensions include:

* Employment type
* Location
* State
* Country
* Department
* Role
* Tenure
* Managerial status
* Group membership
* Organizational relationships

Rules can also represent explicit/manual behavior.

A rule should be understandable in terms of:

1. **Who it applies to**
2. **What policy it produces**
3. **When it is effective**
4. **How it interacts with other applicable rules**

---

## Rule Priority and Conflicts

Multiple rules may apply to the same employee.

For example:

* A general rule assigns a standard vacation policy to all employees.
* A department rule assigns a different policy to Engineering.
* A tenure rule assigns a more generous policy to employees with five or more years of tenure.
* A manual override may explicitly select a policy for one employee.

When multiple rules apply to a policy category with a single-assignment constraint, the product must resolve the conflict deterministically.

The result should be:

* Predictable
* Consistent
* Explainable
* Stable over time

A user should be able to understand why one policy won over another.

Example:

> Employee A receives the Executive Vacation Policy because they match the Executive rule, which has higher priority than the general employee vacation rule.

---

## Effective Dates

Policy assignments and rules are time-dependent.

The product should support questions such as:

> "Which policies applied to Employee A on January 1?"

and:

> "Which policies will apply to Employee A next month?"

A rule or assignment may have an effective start and/or end date.

Historical state should remain understandable rather than being overwritten without context.

Changes to employee attributes can therefore affect policy assignments from a particular point in time.

---

## Reconciliation

Policy assignments should remain correct when the information that determines them changes.

Relevant changes include:

### Employee Changes

Examples:

* Employee relocates from New York to California
* Employee changes departments
* Employee changes employment type
* Employee becomes a manager
* Employee reaches a tenure threshold
* Employee joins or leaves a group

### Rule Changes

Examples:

* A rule's conditions change
* A rule's priority changes
* A rule is enabled or disabled
* A rule's effective dates change
* A rule begins assigning a different policy

### Group Changes

Examples:

* Employee joins a group
* Employee leaves a group
* Group membership changes in a way that affects policy eligibility

When such inputs change, affected policy assignments should be reconciled so the employee's resulting policy state remains correct.

Reconciliation should avoid unnecessarily recalculating unrelated employees or assignments.

---

## Explainability

Policy assignments should have a clear explanation.

For any employee-policy relationship, users should be able to understand:

* Which policy was assigned
* Which rule caused the assignment
* Which employee attributes matched the rule
* Why the rule won if multiple rules applied
* When the assignment became effective
* Whether the assignment was automatic or manually overridden

A useful mental model is:

```text
Employee
   ↓
Employee context
   ↓
Matching conditions
   ↓
Applicable rules
   ↓
Conflict resolution
   ↓
Policy assignment
```

---

## Auditability

Important changes to policies, rules, employee attributes, and assignments should be traceable.

The product should be able to answer:

> "Why does employee X have assignment Y as of date Z?"

and:

> "What changed to cause this employee's policy assignment to change?"

Relevant history includes:

* Rule creation
* Rule edits
* Rule enable/disable changes
* Rule priority changes
* Employee attribute changes
* Group membership changes
* Assignment creation
* Assignment removal
* Assignment changes
* Manual overrides

The history should make it possible to reconstruct the reasoning behind an employee's policy state at a particular point in time.

---

## User Experience Principles

Policy management is intended for company administrators and other non-engineering users.

Users should not need to understand implementation details to configure policies.

The product should make it easy to:

* Understand existing policies
* Create assignment rules
* Define who a rule applies to
* Understand which employees a rule affects
* See which policies an employee will receive
* Understand why an employee received a policy
* Understand the consequences of changing an employee attribute
* Review conflicts and overrides
* Review historical changes

### New Employee Onboarding

When onboarding a new employee, administrators should be able to understand which policies will apply to them based on their employee information.

Example:

```text
Employee
Sarah
Engineering
California
Full-time
3 years tenure

Applicable policies

✓ Engineering Vacation Policy
✓ California Compliance Training
✓ Bi-weekly Pay Schedule
✓ Engineering Equipment Stipend
✓ GitHub
✓ Slack
```

The relationship between employee information and resulting assignments should be clear.

### Changing Employee Information

When an administrator changes an attribute that can affect policy assignments, the product should make downstream consequences visible.

Example:

```text
Department

Engineering → Sales

This change will affect:

Removed
- Engineering Equipment Stipend
- Engineering Vacation Policy

Added
- Sales Expense Policy
- Sales Commission Policy
```

The goal is to make policy changes predictable rather than surprising.

---

## Product Terminology

Use these terms consistently:

* **Employee** — a person in a company's workforce
* **Policy** — a company's defined behavior, entitlement, requirement, or access rule
* **Policy assignment** — the relationship indicating that a policy applies to an employee
* **Assignment rule** — logic that determines which employees should receive a policy
* **Condition** — an individual requirement used by an assignment rule
* **Policy category** — a grouping of policies with a defined assignment cardinality
* **Manual override** — an explicit decision that takes precedence over automatic applicability
* **Effective date** — the point in time at which a rule, policy, or assignment becomes applicable
* **Reconciliation** — bringing policy assignments back into the correct state after relevant inputs change
* **Cardinality** — how many policies an employee can have within a category

---

## Domain Principles

When reasoning about the product, preserve these principles:

1. Policy assignments are derived from employee context and explicit decisions.
2. The same employee can have many assignments across different policy categories.
3. Different policy categories can have different cardinalities.
4. Multiple rules can apply to the same employee.
5. Conflicts must have deterministic and explainable resolution.
6. Assignments are time-dependent and should be understandable historically.
7. Changes to employee information can have downstream assignment consequences.
8. Changes to rules can affect existing employees.
9. Manual overrides are valid product behavior and must be distinguishable from automatic assignments.
10. Users should be able to understand why a policy applies to an employee.
11. The product should preserve an auditable history of meaningful changes.
12. Reconciliation should maintain correctness without unnecessarily processing unaffected data.

---

## Scope of This File

This file provides **high-level declarative product knowledge**.

Do not use it as a substitute for the detailed project documentation.

For implementation work:

* Read `docs/notes.md` for product/domain details.
* Read `docs/architecture.md` for architecture and system-level decisions.
* Read `docs/db.md` for database and persistence details.

Do not invent behavior, architecture, schema, or constraints when the relevant project documentation already defines them.


One doc is still pending which is apis.md where you have to read which apis to build from my point of view