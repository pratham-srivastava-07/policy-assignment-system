import { Suspense } from "react"
import type { Metadata } from "next"
import { Skeleton } from "@/components/ui"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Sign in · Policy" }

export default function LoginPage() {
  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <LoginForm />
    </Suspense>
  )
}
