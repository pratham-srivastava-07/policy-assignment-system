import bcrypt from "bcrypt"
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AuthContext,
  AuthSessionDTO,
  ERROR_CODES,
  MeDTO,
  PASSWORD_SALT_ROUNDS,
  SESSION_TTL_SECONDS,
} from "@policy/shared"
import {
  AuditEventRepository,
  OrganizationMembershipRepository,
  OrganizationRepository,
  SessionRepository,
  TransactionManager,
  UserRepository,
} from "@policy/core"
import { AuthServiceInterface } from "../interfaces/auth"
import { LoginInput, SignupInput } from "../validators"
import { AppError } from "@policy/core"
import { generateSessionToken, hashSessionToken } from "../utils/token"
import { toPublicOrganization, toPublicUser } from "@policy/core"

/**
 * Stateful authentication.
 *
 * A session row is the authority: the bearer token carries no claims, so
 * revoking a row logs the holder out immediately. The organization a request may
 * act in is read from that row and from nowhere else.
 */
export class AuthService implements AuthServiceInterface {

  constructor(
    private transactions: TransactionManager,
    private organizations: OrganizationRepository,
    private users: UserRepository,
    private memberships: OrganizationMembershipRepository,
    private sessions: SessionRepository,
    private audit: AuditEventRepository,
  ) {}

  /**
   * Signup bootstraps a whole tenant in one transaction: organization, first
   * user, that user's COMPANY_ADMIN membership, and a session.
   *
   * ---------------------------------------------------------------------------
   * V2: INVITE / JOIN FLOW — DEFERRED, DELIBERATELY NOT BUILT
   * ---------------------------------------------------------------------------
   * Org-creating signup is the v1 BOOTSTRAP and nothing more. Nothing else in
   * the API can create an organization, so without this the system has no
   * reachable state at all — the first user has to be able to bring a tenant
   * into existence. It is not the intended way a colleague joins an existing
   * company, and it should not be treated as one: every signup today produces a
   * brand-new organization whose only member is a COMPANY_ADMIN.
   *
   * Joining an EXISTING organization by invitation is v2. It is not stubbed,
   * half-wired or feature-flagged anywhere in this codebase — there is no
   * invitations table, no token, no endpoint. What it would take, when it is
   * built:
   *
   *   * an `invitations` table: organization, invited email, the role being
   *     offered, the inviting user, an expiry, a single-use acceptance
   *     timestamp, and the HASH of the invite token (never the token itself,
   *     for the same reason `sessions` stores only a hash);
   *   * a token handed to the invitee out of band, which is the only thing that
   *     proves they were invited — acceptance must not take an organization id
   *     from the request body, or anyone could join any tenant by guessing;
   *   * issuing an invite gated on `member:write`, which COMPANY_ADMIN holds and
   *     HR_ADMIN deliberately does not — deciding who gets access to the tenant
   *     is exactly the line those two roles are split on. The role being offered
   *     must be capped at the inviter's own;
   *   * acceptance becoming the second entry point to this file: it creates the
   *     user (or attaches an existing one), creates the membership at the
   *     invited role, burns the invitation, and issues a session — while
   *     creating NO organization;
   *   * signup itself then narrowing to first-run bootstrap, or disappearing
   *     behind the invite flow entirely.
   *
   * Until then the assumption above stands, stated rather than hidden.
   */
  async signup(data: SignupInput): Promise<AuthSessionDTO> {

    const existing = await this.users.findByEmail(data.email)

    if (existing) {

      throw new AppError(
        "An account with this email already exists",
        409,
        ERROR_CODES.ALREADY_EXISTS,
      )
    }

    const passwordHash = await bcrypt.hash(data.password, PASSWORD_SALT_ROUNDS)
    const token = generateSessionToken()
    const tokenHash = hashSessionToken(token)
    const expiresAt = this.sessionExpiry()

    const result = await this.transactions.run(async (tx) => {

      const organization = await this.organizations.create({ name: data.organizationName }, tx)

      const user = await this.users.create(
        {
          name: data.name,
          email: data.email,
          passwordHash,
        },
        tx,
      )

      await this.memberships.create(
        {
          userId: user.id,
          organizationId: organization.id,
          role: "COMPANY_ADMIN",
        },
        tx,
      )

      const session = await this.sessions.create(
        {
          userId: user.id,
          organizationId: organization.id,
          tokenHash,
          expiresAt,
        },
        tx,
      )

      await this.audit.record(
        organization.id,
        {
          actorId: user.id,
          action: AUDIT_ACTIONS.ORGANIZATION_CREATED,
          entityType: AUDIT_ENTITY_TYPES.ORGANIZATION,
          entityId: organization.id,
          afterState: { name: organization.name },
        },
        tx,
      )

      await this.audit.record(
        organization.id,
        {
          actorId: user.id,
          action: AUDIT_ACTIONS.USER_CREATED,
          entityType: AUDIT_ENTITY_TYPES.USER,
          entityId: user.id,
          afterState: { email: user.email, name: user.name, role: "COMPANY_ADMIN" },
        },
        tx,
      )

      await this.audit.record(
        organization.id,
        {
          actorId: user.id,
          action: AUDIT_ACTIONS.SESSION_CREATED,
          entityType: AUDIT_ENTITY_TYPES.SESSION,
          entityId: session.id,
        },
        tx,
      )

      return { organization, user, session }
    })

    return {
      user: toPublicUser(result.user),
      organization: toPublicOrganization(result.organization),
      role: "COMPANY_ADMIN",
      token,
      expiresAt: result.session.expiresAt.toISOString(),
    }
  }

  async login(data: LoginInput): Promise<AuthSessionDTO> {

    const user = await this.users.findByEmail(data.email)

    // Hash comparison happens even when the user is missing so that a wrong
    // email and a wrong password take the same time to answer.
    const passwordMatches = user
      ? await bcrypt.compare(data.password, user.passwordHash)
      : await bcrypt.compare(data.password, this.dummyHash())

    if (!user || !passwordMatches) {

      throw new AppError("Invalid email or password", 401, ERROR_CODES.INVALID_CREDENTIALS)
    }

    const memberships = await this.memberships.findForUser(user.id)

    if (memberships.length === 0) {

      throw new AppError(
        "This account does not belong to an organization",
        403,
        ERROR_CODES.NO_ORGANIZATION_MEMBERSHIP,
      )
    }

    // A user with several memberships would need to pick one, and the
    // organization cannot come from request input. No flow in the current API
    // produces a second membership, so this is unreachable today; it fails loudly
    // rather than guessing which tenant to open.
    if (memberships.length > 1) {

      throw new AppError(
        "This account belongs to multiple organizations; organization selection is not implemented",
        409,
        ERROR_CODES.CONFLICT,
      )
    }

    const membership = memberships[0]!
    const organization = await this.organizations.findById(membership.organizationId)

    if (!organization) {

      throw new AppError("Organization not found", 404, ERROR_CODES.NOT_FOUND)
    }

    const token = generateSessionToken()
    const tokenHash = hashSessionToken(token)
    const expiresAt = this.sessionExpiry()

    const session = await this.transactions.run(async (tx) => {

      const created = await this.sessions.create(
        {
          userId: user.id,
          organizationId: organization.id,
          tokenHash,
          expiresAt,
        },
        tx,
      )

      await this.audit.record(
        organization.id,
        {
          actorId: user.id,
          action: AUDIT_ACTIONS.SESSION_CREATED,
          entityType: AUDIT_ENTITY_TYPES.SESSION,
          entityId: created.id,
        },
        tx,
      )

      return created
    })

    return {
      user: toPublicUser(user),
      organization: toPublicOrganization(organization),
      role: membership.role,
      token,
      expiresAt: session.expiresAt.toISOString(),
    }
  }

  /** Server-side logout. Idempotent. */
  async logout(sessionId: string, actorId: string, organizationId: string): Promise<void> {

    await this.transactions.run(async (tx) => {

      const revoked = await this.sessions.revoke(sessionId, new Date(), tx)

      if (revoked > 0) {

        await this.audit.record(
          organizationId,
          {
            actorId,
            action: AUDIT_ACTIONS.SESSION_REVOKED,
            entityType: AUDIT_ENTITY_TYPES.SESSION,
            entityId: sessionId,
          },
          tx,
        )
      }
    })
  }

  async me(auth: AuthContext): Promise<MeDTO> {

    const [user, organization] = await Promise.all([
      this.users.findById(auth.userId),
      this.organizations.findById(auth.organizationId),
    ])

    if (!user || !organization) {

      throw new AppError("Session is no longer valid", 401, ERROR_CODES.UNAUTHENTICATED)
    }

    return {
      user: toPublicUser(user),
      organization: toPublicOrganization(organization),
      role: auth.role,
    }
  }

  /**
   * Resolves a raw bearer token to the identity and tenant it grants.
   *
   * Returning null rather than throwing keeps the decision about status codes in
   * the middleware.
   */
  async resolveSession(token: string): Promise<AuthContext | null> {

    const session = await this.sessions.findActiveByTokenHash(hashSessionToken(token))

    if (!session) {

      return null
    }

    const [user, membership] = await Promise.all([
      this.users.findById(session.userId),
      this.memberships.findOne(session.userId, session.organizationId),
    ])

    // The membership is re-checked on every request: revoking someone's access to
    // an organization must take effect immediately, not when their token expires.
    if (!user || !membership) {

      return null
    }

    await this.sessions.touch(session.id)

    return {
      userId: user.id,
      sessionId: session.id,
      organizationId: session.organizationId,
      role: membership.role,
      employeeId: user.employeeId,
    }
  }

  private sessionExpiry(): Date {

    return new Date(Date.now() + SESSION_TTL_SECONDS * 1000)
  }

  /**
   * A fixed valid bcrypt digest, compared against when no user was found, so an
   * unknown email costs the same time as a wrong password.
   */
  private dummyHash(): string {

    return "$2b$12$C6UzMDM.H6dfI/f/IKcEe.tUuS0Zvu5D5j0KZ0v0i0Q4Bx0Wm2Yqi"
  }
}
