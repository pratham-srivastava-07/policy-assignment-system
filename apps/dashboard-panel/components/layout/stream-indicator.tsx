"use client"

import Link from "next/link"
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui"
import { formatRelative } from "@/lib/dates"
import { STREAM_STATUS_LABELS, useReconciliationStream } from "@/lib/stream"
import { useReconciliationStatus } from "@/features/reference/hooks"

/**
 * Connection state, made visible (design-pattern.md).
 *
 * A real-time feature that silently goes stale is worse than honest polling, so
 * this never hides. It is the one place in the header allowed to be coloured,
 * and only ever to say that something is wrong.
 */
export const StreamIndicator = () => {
  const { status, reconnect, lastMessageAt } = useReconciliationStream()

  const tone =
    status === "live"
      ? "text-status-success"
      : status === "stale" || status === "reconnecting"
        ? "text-status-warning"
        : status === "offline"
          ? "text-status-danger"
          : "text-ink-subtle"

  const Icon = status === "offline" ? WifiOff : status === "live" ? Wifi : RefreshCw
  const degraded = status === "stale" || status === "offline"

  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn("inline-flex items-center gap-1.5 text-xs", tone)}
        role="status"
        aria-live="polite"
      >
        <Icon
          className={cn("size-3.5", status === "reconnecting" && "animate-spin")}
          aria-hidden
        />
        <span className="hidden sm:inline">{STREAM_STATUS_LABELS[status]}</span>
        {status === "stale" && lastMessageAt ? (
          <span className="tabular hidden text-ink-subtle md:inline">
            since {formatRelative(new Date(lastMessageAt).toISOString())}
          </span>
        ) : null}
      </span>

      {degraded ? (
        <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={reconnect}>
          Reconnect
        </Button>
      ) : null}
    </div>
  )
}

/**
 * The reconciliation backlog (design.md §31.3).
 *
 * An organization-level number, never a per-employee state and never a spinner:
 * a backlog is a count, and nothing in the API can say "Alice is stale".
 * Absent entirely when the backlog is zero.
 */
export const BacklogIndicator = () => {
  const { data, dataUpdatedAt } = useReconciliationStatus()

  if (!data) return null

  const pending = data.counts.PENDING + data.counts.PROCESSING
  const failed = data.counts.FAILED

  if (pending === 0 && failed === 0) return null

  const ageMinutes = data.oldestPendingAt
    ? Math.floor((dataUpdatedAt - new Date(data.oldestPendingAt).getTime()) / 60_000)
    : 0

  return (
    <div className="flex items-center gap-2">
      {pending > 0 ? (
        <span
          className={cn(
            "tabular inline-flex items-center gap-1.5 text-xs",
            ageMinutes >= 5 ? "text-status-warning" : "text-ink-muted",
          )}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          {pending} pending
          {ageMinutes >= 5 ? ` · oldest ${ageMinutes}m` : ""}
        </span>
      ) : null}

      {failed > 0 ? (
        <Link
          href="/activity?tab=events&status=FAILED"
          className="tabular inline-flex items-center gap-1.5 text-xs text-status-danger hover:underline"
        >
          <AlertTriangle className="size-3.5" aria-hidden />
          {failed} failed
        </Link>
      ) : null}
    </div>
  )
}
