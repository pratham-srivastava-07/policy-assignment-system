import { NextFunction, Response } from "express"
import { AuthedRequest } from "../interfaces/auth"
import { IPolicyCategoryController, IPolicyController } from "../interfaces/policy"
import { PolicyCategoryService, PolicyService } from "../services/policy"
import {
  createPolicyCategorySchema,
  createPolicySchema,
  idParam,
  listPoliciesQuerySchema,
  listPolicyCategoriesQuerySchema,
  patchPolicyCategorySchema,
  patchPolicySchema,
  policyAssignmentsQuerySchema,
  replacePolicySchema,
} from "../validators"
import { toHttpError } from "@policy/core"
import { requireAuthContext } from "../middlewares/auth"

/**
 * Every handler takes its organization from `requireAuthContext(req)` — never
 * from a route or query parameter. That is the tenant boundary.
 */
export class PolicyCategoryController implements IPolicyCategoryController {

  constructor(private service: PolicyCategoryService) {}

  create = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const data = createPolicyCategorySchema.parse(req.body)

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
      const query = listPolicyCategoriesQuerySchema.parse(req.query)

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
      const data = patchPolicyCategorySchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.patch(auth.organizationId, auth.userId, id, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  delete = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.delete(auth.organizationId, auth.userId, id),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }
}

export class PolicyController implements IPolicyController {

  constructor(private service: PolicyService) {}

  create = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const data = createPolicySchema.parse(req.body)

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
      const query = listPoliciesQuerySchema.parse(req.query)

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

  replace = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const data = replacePolicySchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.replace(auth.organizationId, auth.userId, id, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  patch = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const data = patchPolicySchema.parse(req.body)

      res.status(200).json({
        success: true,
        data: await this.service.patch(auth.organizationId, auth.userId, id, data),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  delete = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)

      res.status(200).json({
        success: true,
        data: await this.service.delete(auth.organizationId, auth.userId, id),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  listAssignments = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)
      const { id } = idParam.parse(req.params)
      const query = policyAssignmentsQuerySchema.parse(req.query)

      res.status(200).json({
        success: true,
        data: await this.service.listAssignments(auth.organizationId, id, query),
      })
    } catch (err) {

      next(toHttpError(err))
    }
  }
}
