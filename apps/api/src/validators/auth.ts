import { z } from "zod"
import { email, password, shortText } from "./common"

/**
 * Signup bootstraps a tenant: it creates the organization, the first user, and
 * that user's COMPANY_ADMIN membership together.
 *
 * There is no other path that creates an organization — no invite flow and no
 * organization endpoints — so signup has to carry the organization name.
 */
export const signupSchema = z
  .object({
    name: shortText,
    email,
    password,
    organizationName: z.string().trim().min(1, "Organization name is required").max(150),
  })
  .strict()

/**
 * Login deliberately does NOT accept an organization id. The session's
 * organization is derived from the user's membership server-side; letting a
 * client name the organization would put a tenant boundary in request input.
 */
export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, "Password is required"),
  })
  .strict()

export type SignupInput = z.infer<typeof signupSchema>

export type LoginInput = z.infer<typeof loginSchema>
