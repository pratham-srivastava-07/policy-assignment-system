Background
Warp is the system of intelligence for a company's people. Companies use it to send offers, onboard and pay their employees, manage IT and application access, track and approve time off, expenses, and timesheets. Warp maintains the org chart, compensation, benefits, device fleets, work schedules, compliance, and more. Companies have internal policies for each of these functionalities to govern the way that their company runs.

There are time off policies, there are policies for which apps a user is allowed to access, there are expense policies. A company may have a vacation policy that applies just to executives. It may have compliance trainings that only apply to employees residing in California. It may pay global employees monthly while paying US employees bi-weekly. People with 5 year tenures might be eligible for a greater 401k match.

A repeated pattern arises across all of this information: a company has some policy that applies to the workers based on the context of their employment or their personal information. We call these assignments of policies to employees "policy assignments."

Problem statement
Employees can have many policy assignments. For example:

Time off policies: Vacation, Sick, Maternity, etc
Pay schedules: weekly, bi-weekly, semi-monthly
Work schedules: which days/hours the employee works
Shift policies: overtime rules, physical clock-in locations
Holiday calendar: when the employee has off by default
Benefit plans: healthcare, retirement, commuter, gym stipend
Application access: which tools an employee can log into
Compliance trainings: Workplace harassment training, security training
Manager: who an employee reports to
Each feature has vastly different business logic but all companies manage assignments based on the employees' information:

Employment type-based: "Hourly US W-2 employees are subject to a specific shift tracking policy"
Location-based: "California-based employees must sign the CA Meal Break policy"
Tenure-based: "once an employee hits 2 years of tenure, they get moved to a more generous time-off policy"
Department based: "Engineering team gets a monitor and keyboard stipend"
Org-chart based: "Managers must complete extra sexual harassment training"
Manual: "override the applicable rules and always pay this contractor monthly"
Relationships can have different cardinalities:

One-to-one / many-to-one: an employee has exactly one manager, one pay schedule, one time-off policy per category (sick, vacation, etc). Many employees can point at the same manager, but an employee can't have two.
Many-to-many: an employee can have access to many apps, belong to many groups, and have many trainings to do; each of those is shared across many employees.
Your task
Design a system that, at a minimum, lets a company:

Define assignment rules against the employee population: attribute-based, location-based, tenure-based, department-based, manual, etc.
Resolve for any set of employees the full set of policies that apply on any given date respecting cardinality constraints and resolving conflicts deterministically when multiple rules can apply for any number of policies
Reconcile correctly and efficiently when inputs change: an employee's attributes change (relocates, switches department, crosses a tenure threshold), a rule is edited, or a group's membership changes.
Evaluation criteria
Correct resolution and reconciliation: does the system have mechanisms to stay correct over time? Is conflict and priority resolution deterministic and explainable?
User experience: How can we present this feature to non-engineer users? What does the initial setup look like as a company admin? When a user goes to onboard a new employee how can we make it clear which policies get assigned? What about when a user changes an attribute that has downstream assignment implications?
Architecture choice: Choose infrastructure, tools, and patterns to store and run this that will elegantly represent the assignment relationships and scale well to its read/write patterns.
Auditable: can you answer "why does employee X have assignment Y as of date Z?" Are changes to rules and assignments tracked and logged?
Developer Experience: is the system understandable? Did you build the right abstractions to make it delightful to work on and easy to extend?
Clear communication: can you communicate your system design and its tradeoffs well, in whichever form you choose?
Submission
Format: any combination of system diagram, database schemas, example code, report, repository, tech stack, list of desired tools/services, pros/cons. The doc is deliberately very broad.

Where: email your submission to eng@warp.co.