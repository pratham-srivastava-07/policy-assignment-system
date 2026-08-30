import { Router } from "express"
import { PERMISSIONS } from "@policy/shared"
import { ruleController } from "../controllers"
import { requireAuth } from "../middlewares/auth"
import { requireBackdatePermission, requirePermission } from "../middlewares/permission"
import { rateLimit } from "../middlewares/rate-limit"

export const ruleRouter = Router()

ruleRouter.use(requireAuth)

// Before "/:id", otherwise "simulate" would be read as a rule id.
//
// Simulation evaluates an unsaved rule against the whole population, so its cost
// scales with headcount rather than request size. That is the EXPENSIVE tier's
// entire reason for existing, and why it is keyed by organization: one user
// tuning a rule must not be able to spend the whole tenant's capacity.
ruleRouter.post(
  "/simulate",
  rateLimit.expensive(),
  requirePermission(PERMISSIONS.RULE_READ),
  ruleController.simulate,
)

// A rule's effective window decides which days it was in force, so opening one
// in the past re-decides who held which policy on those days. Same gate as an
// employee attribute correction.
ruleRouter.post(
  "/",
  rateLimit.write(),
  requirePermission(PERMISSIONS.RULE_WRITE),
  requireBackdatePermission(),
  ruleController.create,
)

ruleRouter.get(
  "/",
  rateLimit.read(),
  requirePermission(PERMISSIONS.RULE_READ),
  ruleController.list,
)

// Literal sub-paths, likewise before the bare "/:id" routes.
ruleRouter.get(
  "/:id/versions",
  rateLimit.read(),
  requirePermission(PERMISSIONS.RULE_READ),
  ruleController.listVersions,
)

// Population-wide evaluation, same cost profile as simulate.
ruleRouter.get(
  "/:id/matching-employees",
  rateLimit.expensive(),
  requirePermission(PERMISSIONS.RULE_READ, PERMISSIONS.EMPLOYEE_READ),
  ruleController.matchingEmployees,
)

ruleRouter.patch(
  "/:id/priority",
  rateLimit.write(),
  requirePermission(PERMISSIONS.RULE_WRITE),
  ruleController.patchPriority,
)

ruleRouter.post(
  "/:id/enable",
  rateLimit.write(),
  requirePermission(PERMISSIONS.RULE_WRITE),
  ruleController.enable,
)

ruleRouter.post(
  "/:id/disable",
  rateLimit.write(),
  requirePermission(PERMISSIONS.RULE_WRITE),
  ruleController.disable,
)

ruleRouter.get(
  "/:id",
  rateLimit.read(),
  requirePermission(PERMISSIONS.RULE_READ),
  ruleController.getById,
)

ruleRouter.patch(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.RULE_WRITE),
  requireBackdatePermission(),
  ruleController.patch,
)

// A soft delete: the rule is disabled and end-dated today, never removed. A rule
// with versions has assignments pointing at it that still have to be explainable.
ruleRouter.delete(
  "/:id",
  rateLimit.write(),
  requirePermission(PERMISSIONS.RULE_WRITE),
  ruleController.delete,
)
