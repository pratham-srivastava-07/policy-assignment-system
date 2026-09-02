"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Clock, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { detailFor, headlineFor, isApiError } from "@/lib/api"
import { Button } from "./button"

/**
 * §40.2: server validation arrives as one joined `message` string, so it is a
 * form-level banner and never a field-level message.
 */
export const FormErrorBanner = ({
  error,
  className,
}: {
  error: unknown
  className?: string
}) => {
  if (!error) return null

  const detail = detailFor(error)

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger",
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{headlineFor(error)}</span>
        {detail ? <span className="text-status-danger/90">{detail}</span> : null}
      </div>
    </div>
  )
}

/**
 * §40.5. Rendered inline in the panel that triggered the call so unsaved work
 * stays visible, and never wired to an automatic retry: the budget of 5 is
 * shared by the whole organization.
 */
export const RateLimitNotice = ({
  error,
  what = "requests",
  onRetry,
  className,
}: {
  error: unknown
  what?: string
  onRetry?: () => void
  className?: string
}) => {
  const seconds = isApiError(error) ? error.retryAfterSeconds : null
  const [remaining, setRemaining] = useState(seconds ?? 0)
  const [countingFrom, setCountingFrom] = useState(seconds)

  // A new 429 restarts the countdown. Adjusting during render rather than in an
  // effect keeps the first paint showing the new number, not the stale one.
  if (seconds !== countingFrom) {
    setCountingFrom(seconds)
    setRemaining(seconds ?? 0)
  }

  useEffect(() => {
    if (remaining <= 0) return

    const timer = window.setTimeout(() => setRemaining((value) => value - 1), 1000)

    return () => window.clearTimeout(timer)
  }, [remaining])

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-md bg-status-warning-bg px-3 py-2 text-sm text-status-warning",
        className,
      )}
    >
      <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="flex flex-1 flex-col gap-1">
        <span className="font-medium">Too many {what} right now</span>
        <span>
          This limit is shared across your organization.
          {remaining > 0 ? ` Try again in ${remaining}s.` : " You can try again now."}
        </span>
      </div>
      {onRetry ? (
        <Button size="sm" variant="secondary" disabled={remaining > 0} onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  )
}

/** Page-level failure. §40.3: never a bare "Something went wrong". */
export const ErrorState = ({
  error,
  onRetry,
  action,
  className,
}: {
  error: unknown
  onRetry?: () => void
  action?: ReactNode
  className?: string
}) => {
  if (isApiError(error) && error.isRateLimited) {
    return <RateLimitNotice error={error} onRetry={onRetry} className={className} />
  }

  const detail = detailFor(error)

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-md border border-border px-6 py-12 text-center",
        className,
      )}
    >
      <TriangleAlert className="size-5 text-status-danger" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">{headlineFor(error)}</p>
        {detail ? <p className="max-w-md text-sm text-ink-muted">{detail}</p> : null}
      </div>
      {action ??
        (onRetry ? (
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        ) : null)}
    </div>
  )
}
