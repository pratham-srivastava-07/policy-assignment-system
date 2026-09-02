"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button, Field, FormErrorBanner, Input } from "@/components/ui"
import { useSession } from "@/lib/auth"
import { hasWorkspace } from "@/lib/permissions"
import { signupSchema, type SignupValues } from "../schemas"

export const SignupForm = () => {
  const router = useRouter()
  const { signUp } = useSession()
  const [error, setError] = useState<unknown>(null)

  const form = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: "", email: "", password: "", organizationName: "" },
  })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)

    try {
      const session = await signUp(values)
      router.replace(hasWorkspace(session.role) ? "/employees" : "/unavailable")
    } catch (cause) {
      setError(cause)
    }
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-ink">Create an organization</h1>
        {/* §9.1: this copy is the honest description of what signup does. */}
        <p className="text-sm text-ink-muted">
          This creates a new organization with you as its administrator. To join an
          existing organization, ask its administrator to add you.
        </p>
      </div>

      <FormErrorBanner error={error} />

      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Field
          id="organizationName"
          label="Organization name"
          error={form.formState.errors.organizationName?.message}
        >
          <Input
            id="organizationName"
            autoFocus
            aria-invalid={Boolean(form.formState.errors.organizationName)}
            {...form.register("organizationName")}
          />
        </Field>

        <Field id="name" label="Your name" error={form.formState.errors.name?.message}>
          <Input
            id="name"
            autoComplete="name"
            aria-invalid={Boolean(form.formState.errors.name)}
            {...form.register("name")}
          />
        </Field>

        <Field id="email" label="Email" error={form.formState.errors.email?.message}>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            aria-invalid={Boolean(form.formState.errors.email)}
            {...form.register("email")}
          />
        </Field>

        <Field
          id="password"
          label="Password"
          hint="At least 8 characters, with upper and lower case, a number and a symbol."
          error={form.formState.errors.password?.message}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={Boolean(form.formState.errors.password)}
            {...form.register("password")}
          />
        </Field>

        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          Create organization
        </Button>
      </form>

      <p className="text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
