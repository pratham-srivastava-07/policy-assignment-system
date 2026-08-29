import { NextFunction, Response } from "express"
import { AuthedRequest } from "../interfaces/auth"
import { IRuleController } from "../interfaces/rule"
import { RuleService } from "../services/rule"
import {
  createOverrideSchema,
  createRuleSchema,
  idParam,
  listRulesQuerySchema,
  matchingEmployeesQuerySchema,
  patchRulePrioritySchema,
  patchRuleSchema,
  simulateRuleSchema,
} from "../validators"
import { toHttpError } from "@policy/core"
import { requireAuthContext } from "../middlewares/auth"

/**
 * Rules, and the two read-only endpoints that run the engine without writing:
 * `matching-employees` for a saved rule and `simulate` for an unsaved one.
 *
 * The organization always comes from the session. A rule is the mechanism that
 * decides who gets what, so a rule endpoint that took its tenant from the
 * request body would be the whole security model undone in one parameter.
 */
export class RuleController implements IRuleController {

  constructor(private service: RuleService) {}

  create = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const data = createRuleSchema.parse(req.body)

      res.status(201).json({
        success: true,
        data: await this.service.create(auth.organizationId, auth.userId, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  list = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const query = listRulesQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.list(auth.organizationId, query),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  getById = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.getById(auth.organizationId, id),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  patch = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const data = patchRuleSchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.patch(auth.organizationId, auth.userId, id, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  patchPriority = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const { priority } = patchRulePrioritySchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.setPriority(
          auth.organizationId,
          auth.userId,
          id,
          priority,
        ),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  enable = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.setEnabled(auth.organizationId, auth.userId, id, true),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  disable = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.setEnabled(auth.organizationId, auth.userId, id, false),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  /** Soft delete: the rule is disabled and end-dated, never removed. */
  delete = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.softDelete(auth.organizationId, auth.userId, id),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  listVersions = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.listVersions(auth.organizationId, id),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  matchingEmployees = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const query = matchingEmployeesQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.matchingEmployees(auth.organizationId, id, query),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  simulate = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const data = simulateRuleSchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.simulate(auth.organizationId, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  listOverrides = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.listOverrides(auth.organizationId, id),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  createOverride = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const data = createOverrideSchema.parse(req.body)

      res.status(201).json({
        success: true,
        data: await this.service.createOverride(
          auth.organizationId,
          auth.userId,
          id,
          data,
        ),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  deleteOverride = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.deleteOverride(auth.organizationId, auth.userId, id),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }
}
