"use client"

import { Suspense, useMemo, useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Activity, AlertTriangle, ExternalLink, Radio } from "lucide-react"
import type { ReconciliationStreamEvent } from "@policy/shared"
import { PageHeader } from "@/components/layout"
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  Label,
  SkeletonRows,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui"
import { DiffCounts, DiffRow, PolicyChip } from "@/components/policy"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { formatRelative } from "@/lib/dates"
import { STREAM_STATUS_LABELS, useReconciliationStream } from "@/lib/stream"
import { listReconciliationEvents } from "@/features/reference/api"

/**
 * The live reconciliation feed (design-pattern.md).
 *
 * Every frame renders as a diff, never a re-render of the world: a row names one
 * employee, the trigger that touched them, and exactly which policies moved.
 *
 * No-op reconciliations are published too, and the default filter hides them.
 * They are not noise to be suppressed at the source: a rule edit that sweeps 120
 * employees and changes 12 is a true and useful fact, and hiding the 108 at the
 * publisher would make the fan-out invisible. The filter is the user's, not the
 * pipeline's.
 */

const TRIGGER_LABELS: Record<string, string> = {
  "employee.attributes_changed": "Attribute changed",
  "employee.created": "Employee created",
  "group.membership_changed": "Group membership changed",
  "group.deleted": "Group deleted",
  "rule.created": "Rule created",
  "rule.updated": "Rule edited",
  "rule.enabled": "Rule enabled",
  "rule.disabled": "Rule disabled",
  "rule.priority_changed": "Rule priority changed",
  "rule.deleted": "Rule retired",
  "override.created": "Override created",
  "override.deleted": "Override revoked",
}

const FeedEvent = ({
  event,
  fresh,
}: {
  event: ReconciliationStreamEvent
  fresh: boolean
}) => {
  const moved = event.added.length + event.removed.length

  return (
    <article
      className={
        fresh
          ? "animate-diff-enter rounded-md border border-accent/40 p-3"
          : "rounded-md border border-border p-3"
      }
    >
      <header className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Link
          href={`/employees/${event.employeeId}`}
          className="text-sm font-medium text-ink hover:underline"
        >
          {event.employeeName}
        </Link>
        <span className="text-xs text-ink-muted">
          {TRIGGER_LABELS[event.trigger] ?? event.trigger}
        </span>
        <DiffCounts
          added={event.added.length}
          removed={event.removed.length}
          unchanged={event.unchangedCount}
          className="ml-auto"
        />
        <span className="tabular w-full text-xs text-ink-subtle sm:w-auto">
          {formatRelative(event.occurredAt)}
        </span>
      </header>

      {moved === 0 ? (
        <p className="text-xs text-ink-subtle">
          Re-evaluated and already correct. Nothing changed.
        </p>
      ) : (
        <div className="flex flex-col">
          {event.added.map((policy) => (
            <DiffRow key={`a-${policy.assignmentId}`} kind="added" highlight={fresh}>
              <PolicyChip
                policyName={policy.policyName}
                categoryName={policy.categoryName}
                cardinality={policy.cardinality}
                sourceRuleName={policy.sourceRuleName}
                sourceRuleVersion={policy.sourceRuleVersion}
                resolutionStatus={policy.resolutionStatus}
                tone="added"
              />
            </DiffRow>
          ))}
          {event.removed.map((policy) => (
            <DiffRow key={`r-${policy.assignmentId}`} kind="removed" highlight={fresh}>
              <PolicyChip
                policyName={policy.policyName}
                categoryName={policy.categoryName}
                cardinality={policy.cardinality}
                sourceRuleName={policy.sourceRuleName}
                sourceRuleVersion={policy.sourceRuleVersion}
                resolutionStatus={policy.resolutionStatus}
                tone="removed"
              />
            </DiffRow>
          ))}
        </div>
      )}
    </article>
  )
}

const OutboxEvents = () => {
  const [status, setStatus] = useState<string>("FAILED")

  const query = useQuery({
    queryKey: queryKeys.reconciliationEvents({ status }),
    queryFn: ({ signal }) => listReconciliationEvents({ status }, signal),
    ...QUERY_TIERS.READ,
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {["FAILED", "PENDING", "PROCESSING", "PROCESSED"].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setStatus(option)}
            aria-pressed={status === option}
            className={
              status === option
                ? "h-7 rounded-sm border border-accent bg-accent-soft px-2 text-xs font-medium text-accent"
                : "h-7 rounded-sm border border-border px-2 text-xs text-ink-muted hover:bg-surface hover:text-ink"
            }
          >
            {option}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <SkeletonRows rows={5} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.data!.items.length === 0 ? (
        <EmptyState
          title={
            status === "FAILED"
              ? "Nothing has failed."
              : status === "PENDING"
                ? "Nothing pending. All changes have been applied."
                : `No ${status.toLowerCase()} events.`
          }
        />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-md border border-border">
          {query.data!.items.map((event) => (
            <div key={event.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Badge
                tone={
                  event.status === "FAILED"
                    ? "danger"
                    : event.status === "PROCESSED"
                      ? "success"
                      : "warning"
                }
              >
                {event.status}
              </Badge>
              <span className="font-mono text-xs text-ink">{event.eventType}</span>
              <span className="text-xs text-ink-subtle">
                {event.aggregateType} {event.aggregateId.slice(0, 8)}
              </span>
              <span className="tabular ml-auto text-xs text-ink-subtle">
                {event.attempts} attempt{event.attempts === 1 ? "" : "s"} ·{" "}
                {formatRelative(event.createdAt)}
              </span>

              {/* §31.5: there is no retry endpoint, so there is no Retry button.
                  The workaround that does exist is a per-employee reconcile. */}
              {event.status === "FAILED" && event.aggregateType === "employee" ? (
                <Link
                  href={`/employees/${event.aggregateId}`}
                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  Open employee
                  <ExternalLink className="size-3" aria-hidden />
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {query.data && query.data.items.some((event) => event.status === "FAILED") ? (
        <p className="flex items-start gap-1.5 text-xs text-ink-subtle">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-danger" aria-hidden />
          A failed row means the relay exhausted its retries. There is no retry endpoint;
          reconcile the affected employee directly.
        </p>
      ) : null}
    </div>
  )
}

const ActivityView = () => {
  const { status, events, unseen, acknowledge } = useReconciliationStream()
  const [changesOnly, setChangesOnly] = useState(true)

  const visible = useMemo(
    () =>
      changesOnly
        ? events.filter((event) => event.added.length + event.removed.length > 0)
        : events,
    [events, changesOnly],
  )

  const sweptCount = events.length - visible.length

  return (
    <>
      <PageHeader
        title="Activity"
        description="Reconciliation as it happens, streamed from the worker."
      />

      <Tabs defaultValue="live">
        <TabsList>
          <TabsTrigger value="live">
            Live feed
            {unseen.size > 0 ? (
              <span className="tabular ml-1.5 rounded-sm bg-accent-soft px-1 text-xs text-accent">
                {unseen.size}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="events">Outbox events</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
              <Radio
                className={
                  status === "live" ? "size-3.5 text-status-success" : "size-3.5 text-ink-subtle"
                }
                aria-hidden
              />
              {STREAM_STATUS_LABELS[status]}
            </span>

            <div className="flex items-center gap-2">
              <Checkbox
                id="changes-only"
                checked={changesOnly}
                onCheckedChange={(value) => setChangesOnly(value === true)}
              />
              <Label htmlFor="changes-only" className="text-xs text-ink-muted">
                Changes only
              </Label>
            </div>

            {changesOnly && sweptCount > 0 ? (
              <span className="tabular text-xs text-ink-subtle">
                {sweptCount} re-evaluated with no change
              </span>
            ) : null}

            {unseen.size > 0 ? (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={acknowledge}>
                Mark as seen
              </Button>
            ) : null}
          </div>

          {status === "stale" ? (
            <p className="rounded-md bg-status-warning-bg px-3 py-2 text-xs text-status-warning">
              The connection is open but has been silent past the heartbeat window. What is
              below may be behind.
            </p>
          ) : null}

          {status === "offline" ? (
            <p className="rounded-md bg-status-danger-bg px-3 py-2 text-xs text-status-danger">
              Not connected. Reconciliation is still running on the server; this page is
              simply not being told about it.
            </p>
          ) : null}

          {visible.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Nothing has reconciled since this page opened."
              description="Edit an employee attribute, or change a rule, and it appears here within a second or two."
            />
          ) : (
            <div className="flex flex-col gap-2">
              {visible.map((event) => (
                <FeedEvent key={event.id} event={event} fresh={unseen.has(event.id)} />
              ))}
            </div>
          )}

          {/* The stream starts when the page loads; it is not a durable log.
              The outbox tab is the record that survives a refresh. */}
          <p className="text-xs text-ink-subtle">
            This feed starts when the workspace opens. For the durable record, see Outbox
            events.
          </p>
        </TabsContent>

        <TabsContent value="events">
          <OutboxEvents />
        </TabsContent>
      </Tabs>
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <ActivityView />
    </Suspense>
  )
}
