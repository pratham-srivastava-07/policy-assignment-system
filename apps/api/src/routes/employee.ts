import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import {
  assignmentController,
  auditController,
  employeeController,
  ruleController,
} from "../controllers"
import { requireAuth } from "../middlewares/auth"
import {
  denySelfScopedRole,
  requirePermission,
  requireSelfOrPermission,
} from "../middlewares/permission"
import { rateLimit } from "../middlewares/rate-limit"

export const employeeRouter = Router()

// Employees are org-scoped, so every route here is authenticated: the
// organization comes from the session, and without one there is nothing to scope
// the query to.
employeeRouter.use(requireAuth)

employeeRouter.post(
  "/",
  rateLimit.write(),
  requirePermission(PERMISSIONS.EMPLOYEE_WRITE),
  employeeController.create,
)

// A collection read has no "your own" narrowing available, so a self-scoped role
// is refused outright rather than handed a silently truncated list.
employeeRouter.get(
  "/",
  rateLimit.read(),
  requirePermission(PERMISSIONS.EMPLOYEE_READ),
  denySelfScopedRole(),
  employeeController.list,
)

// Before "/:id", otherwise a literal path segment would be read as an id.
employeeRouter.get(
  "/:id/attribute-history",
  rateLimit.read(),
  requireSelfOrPermission("id", PERMISSIONS.EMPLOYEE_READ),
  employeeController.getAttributeHistory,
)

// Policy state for one employee, all of it point-in-time (?asOf=YYYY-MM-DD).
// An EMPLOYEE may read this, but only for themselves.
employeeRouter.get(
  "/:id/assignments",
  rateLimit.read(),
  requireSelfOrPermission("id", PERMISSIONS.ASSIGNMENT_READ),
  assignmentController.listForEmployee,
)

// A hypothetical change run through the engine. Writes nothing, but evaluates
// every rule in the organization, so it is billed against the EXPENSIVE tier.
employeeRouter.post(
  "/:id/preview",
  rateLimit.expensive(),
  requirePermission(PERMISSIONS.EMPLOYEE_READ, PERMISSIONS.ASSIGNMENT_READ),
  denySelfScopedRole(),
  assignmentController.preview,
)

// Manual overrides targeting this employee. Revoking one is DELETE /overrides/:id.
employeeRouter.get(
  "/:id/overrides",
  rateLimit.read(),
  requirePermission(PERMISSIONS.RULE_READ),
  ruleController.listOverrides,
)

employeeRouter.post(
  "/:id/overrides",
  rateLimit.write(),
  requirePermission(PERMISSIONS.ASSIGNMENT_OVERRIDE),
  ruleController.createOverride,
)

employeeRouter.get(
  "/:id/audit",
  rateLimit.read(),
  requirePermission(PERMISSIONS.AUDIT_READ),
  auditController.listForEmployee,
)

employeeRouter.get(
  "/:id",
  rateLimit.read(),
  requireSelfOrPermission("id", PERMISSIONS.EMPLOYEE_READ),
  employeeController.getById,
)

employeeRouter.put(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.EMPLOYEE_WRITE),
  employeeController.replace,
)

employeeRouter.patch(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.EMPLOYEE_WRITE),
  employeeController.patch,
)

// DELETE is a termination: the row survives, employment ends, and every open
// group membership and assignment is end-dated. See EmployeeService.terminate.
employeeRouter.delete(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.EMPLOYEE_WRITE),
  employeeController.terminate,
)
