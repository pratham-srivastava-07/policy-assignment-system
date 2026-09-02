import type { Metadata } from "next"
import { SignupForm } from "./signup-form"

export const metadata: Metadata = { title: "Create an organization · Policy" }

export default function SignupPage() {
  return <SignupForm />
}
