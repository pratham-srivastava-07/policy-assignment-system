"use client"

import { ErrorState } from "@/components/ui"

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <ErrorState error={error} onRetry={reset} className="w-full max-w-md" />
    </div>
  )
}
