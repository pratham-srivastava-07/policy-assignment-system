"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Inbox } from "lucide-react"
import { OUTBOX_STATUSES, type OutboxStatus } from "@policy/shared"
import { PageHeader } from "@/components/layout"
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SkeletonRows,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui"
import { cn } from "@/lib/utils"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { formatDayTime, formatRelative } from "@/lib/dates"
import { useReconciliationStatus } from "@/features/reference/hooks"
import { listReconciliationEvents } from "@/features/reference/api"

/**
 * The reconciliation outbox, read-only (design.md §46.2).
 *
 * Reconciliation is asynchronous, so the honest thing to show an admin is the
 * queue itself: how many rows are waiting, how old the oldest one is, and which
 * ones failed. Nothing here can be retried from the browser, because the relay
 * owns that and pretending otherwise would be a button that does nothing.
 */

const STATUS_TONE: Record<OutboxStatus, "success" | "warning" | "danger" | "info"> = {
  PENDING: "warning",
  PROCESSING: "info",
  PROCESSED: "success",
  FAILED: "danger",
}

export default function Page() {
  const [status, setStatus] = useState<string>("ALL")
  const summary = useReconciliationStatus()

  const events = useQuery({
    queryKey: queryKeys.reconciliationEvents({ status }),
    queryFn: ({ signal }) =>
      listReconciliationEvents(status === "ALL" ? {} : { status }, signal),
    ...QUERY_TIERS.READ,
  })

  const counts = summary.data?.counts

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href="/settings">
          <ArrowLeft aria-hidden />
          Settings
        </Link>
      </Button>

      <PageHeader
        title="Reconciliation events"
        description="The outbox behind reconciliation. Rows are written with the change that caused them and picked up by the relay."
      />

      {/* One strip, not four cards. These are four small numbers, and a card
          apiece would give the queue depth more visual weight than the queue. */}
      <div className="mb-4 grid max-w-2xl grid-cols-2 divide-x divide-y divide-border rounded-md border border-border sm:grid-cols-4 sm:divide-y-0">
        {OUTBOX_STATUSES.map((name) => (
          <div key={name} className="flex flex-col gap-0.5 px-3 py-2">
            <span className="text-xs text-ink-subtle">{name.toLowerCase()}</span>
            <span
              className={cn(
                "tabular font-mono text-base",
                name === "FAILED" && (counts?.FAILED ?? 0) > 0
                  ? "text-status-danger"
                  : name === "PENDING" && (counts?.PENDING ?? 0) > 0
                    ? "text-status-warning"
                    : "text-ink",
              )}
            >
              {summary.isPending ? "-" : (counts?.[name] ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {summary.data?.oldestPendingAt ? (
        <p className="mb-4 rounded-md border border-status-warning/35 bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
          The oldest pending row was written {formatRelative(summary.data.oldestPendingAt)}.
          That is how far behind reconciliation currently is.
        </p>
      ) : null}

      <div className="mb-3 flex items-center gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger aria-label="Filter by status" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Any status</SelectItem>
            {OUTBOX_STATUSES.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {events.isPending ? (
        <SkeletonRows rows={8} />
      ) : events.error ? (
        <ErrorState error={events.error} onRetry={() => events.refetch()} />
      ) : events.data!.items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="The outbox is empty."
          description="Every employee change, rule edit and membership change writes a row here. An empty queue means everything has been processed."
        />
      ) : (
        <TableContainer>
          <Table>
            <TableCaption>Outbox rows, newest first.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Trigger</TableHead>
                <TableHead className="hidden md:table-cell">Subject</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-20 text-right">Attempts</TableHead>
                <TableHead className="hidden w-44 text-right lg:table-cell">
                  Written
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.data!.items.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-mono text-xs text-ink">
                    {event.eventType}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs text-ink-subtle md:table-cell">
                    {event.aggregateType} {event.aggregateId.slice(0, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge tone={STATUS_TONE[event.status]}>{event.status}</Badge>
                  </TableCell>
                  <TableCell className="tabular text-right text-ink-muted">
                    {event.attempts}
                  </TableCell>
                  <TableCell className="tabular hidden text-right text-xs text-ink-muted lg:table-cell">
                    {formatDayTime(event.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}
