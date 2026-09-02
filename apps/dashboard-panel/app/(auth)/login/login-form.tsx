"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ERROR_CODES } from "@policy/shared"
import { Button, Field, FormErrorBanner, Input } from "@/components/ui"
import { isApiError } from "@/lib/api"
import { useSession } from "@/lib/auth"
import { hasWorkspace } from "@/lib/permissions"
import { loginSchema, type LoginValues } from "../schemas"

/**
 * §9.4. `POST /auth/login` answers 409 when the email belongs to more than one
 * organization, but it returns no organization list and accepts no
 * organization id, so there is nothing to choose between. Saying that plainly
 * beats a chooser with no options in it.
 */
const MultiOrganizationNotice = () => (
  <div
    role="alert"
    className="flex flex-col gap-1 rounded-md bg-status-info-bg px-3 py-2 text-sm text-status-info"
  >
    <span className="font-medium">This account belongs to more than one organization</span>
    <span>
      Choosing between them is not supported yet. Ask an administrator of the
      organization you need to give you an account there.
    </span>
  </div>
)

export const LoginForm = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { signIn, status, role } = useSession()
  const [error, setError] = useState<unknown>(null)

  const next = searchParams.get("next")
  const destination = next && next.startsWith("/") ? next : "/employees"

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })

  useEffect(() => {
    if (status !== "authenticated") return

    router.replace(hasWorkspace(role) ? destination : "/unavailable")
  }, [status, role, destination, router])

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)

    try {
      const session = await signIn(values)
      router.replace(hasWorkspace(session.role) ? destination : "/unavailable")
    } catch (cause) {
      setError(cause)
    }
  })

  const multiOrganization =
    isApiError(error) && error.status === 409 && error.code === ERROR_CODES.CONFLICT

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-ink">Sign in</h1>
        <p className="text-sm text-ink-muted">Policy assignment administration.</p>
      </div>

      {multiOrganization ? (
        <MultiOrganizationNotice />
      ) : (
        <FormErrorBanner error={error} />
      )}

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field id="email" label="Email" error={form.formState.errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            aria-invalid={Boolean(form.formState.errors.email)}
            {...form.register("email")}
          />
        </Field>

        <Field
          id="password"
          label="Password"
          error={form.formState.errors.password?.message}
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={Boolean(form.formState.errors.password)}
            {...form.register("password")}
          />
        </Field>

        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          Sign in
        </Button>
      </form>

      <p className="text-sm text-ink-muted">
        Need a new organization?{" "}
        <Link href="/signup" className="text-accent underline-offset-4 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  )
}
