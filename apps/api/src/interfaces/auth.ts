import { NextFunction, Request, Response } from "express"
import { AuthContext, AuthSessionDTO, MeDTO } from "@policy/shared"
import { LoginInput, SignupInput } from "../validators"

/**
 * A request that has passed `requireAuth`.
 *
 * `auth.organizationId` is read from the session row. It is the ONLY source of
 * organization scope in this application — no controller may take an
 * organization from a path, body or query parameter.
 */
export interface AuthedRequest extends Request {
  auth?: AuthContext
}

export interface AuthServiceInterface {
  signup(data: SignupInput): Promise<AuthSessionDTO>
  login(data: LoginInput): Promise<AuthSessionDTO>
  logout(sessionId: string, actorId: string, organizationId: string): Promise<void>
  me(auth: AuthContext): Promise<MeDTO>
  /** Resolves a raw bearer token to an auth context, or null. */
  resolveSession(token: string): Promise<AuthContext | null>
}

export interface IAuthController {
  signup(req: Request, res: Response, next: NextFunction): Promise<void>
  login(req: Request, res: Response, next: NextFunction): Promise<void>
  logout(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
  me(req: AuthedRequest, res: Response, next: NextFunction): Promise<void>
}
