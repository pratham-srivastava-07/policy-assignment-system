import { NextFunction, Request, Response } from "express"
import { AuthedRequest, IAuthController } from "../interfaces/auth"
import { AuthService } from "../services/auth"
import { loginSchema, signupSchema } from "../validators"
import { toHttpError } from "@policy/core"
import { requireAuthContext } from "../middlewares/auth"

export class AuthController implements IAuthController {

  constructor(private service: AuthService) {}

  // Arrow-fn properties keep `this` bound when handed to Express routes.

  signup = async (req: Request, res: Response, next: NextFunction): Promise<void> => {

    try {

      const data = await this.service.signup(signupSchema.parse(req.body))

      res.status(201).json({ success: true, data })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {

    try {

      const data = await this.service.login(loginSchema.parse(req.body))

      res.status(200).json({ success: true, data })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  logout = async (
    req: AuthedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {

    try {

      const auth = requireAuthContext(req)

      await this.service.logout(auth.sessionId, auth.userId, auth.organizationId)

      res.status(200).json({ success: true, data: { revoked: true } })
    } catch (err) {

      next(toHttpError(err))
    }
  }

  me = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {

    try {

      const auth = requireAuthContext(req)

      res.status(200).json({ success: true, data: await this.service.me(auth) })
    } catch (err) {

      next(toHttpError(err))
    }
  }
}
