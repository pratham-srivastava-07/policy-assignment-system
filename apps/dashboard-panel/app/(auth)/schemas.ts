import { z } from "zod"

/**
 * §36.2: `@policy/shared` carries no Zod, and the API's validators live inside
 * `apps/api`. These deliberately duplicate the server's rules so the user gets
 * field-level feedback; the server stays the authority (§40.2).
 */

const password = z
  .string()
  .min(8, "At least 8 characters")
  .max(128, "At most 128 characters")
  .regex(/[a-z]/, "Must contain a lowercase letter")
  .regex(/[A-Z]/, "Must contain an uppercase letter")
  .regex(/[0-9]/, "Must contain a number")
  .regex(/[^A-Za-z0-9]/, "Must contain a special character")

export const loginSchema = z.object({
  email: z.email("A valid email address is required"),
  password: z.string().min(1, "Password is required"),
})

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Your name is required").max(100),
  email: z.email("A valid email address is required"),
  password,
  organizationName: z.string().trim().min(1, "Organization name is required").max(150),
})

export type LoginValues = z.infer<typeof loginSchema>
export type SignupValues = z.infer<typeof signupSchema>
