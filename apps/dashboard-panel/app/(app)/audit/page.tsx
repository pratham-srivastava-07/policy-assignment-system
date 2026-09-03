"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useQuery } from "@tanstack/react-query"
import { ChevronRight, ClipboardList, Search } from "lucide-react"
import {
  AUDIT_ENTITY_TYPES,
  DEFAULT_PAGE_SIZE,
  type AuditEventDTO,
} from "@policy/shared"
import { PageHeader } from "@/components/layout"
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SkeletonRows,
} from "@/components/ui"
import { DiffRow } from "@/components/policy"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { formatDayTime, formatRelative, withAsOf, useAsOf } from "@/lib/dates"
import { useActorNames } from "@/features/reference/hooks"
import { listAuditEvents, type AuditFilters } from "@/features/reference/api"

/**
 * The audit log (design.md §32).
 *
 * One row per meaningful change, with the before and after states behind a
 * drawer rather than in the table: the answer to "what changed" is usually two
 * fields out of twenty, and a table wide enough to show all of them is a table
 * nobody scans.
 */

const ENTITY_TYPES = Object.values(AUDIT_ENTITY_TYPES)

const ACTION_TONE = (action: string): "success" | "danger" | "warning" | "neutral" => {
  if (action.endsWith(".created") || action.endsWith(".added") || action.endsWith(".enabled"))
    return "success"
  if (
    action.endsWith(".deleted") ||
    action.endsWith(".removed") ||
    action.endsWith(".revoked") ||
    action.endsWith(".disabled") ||
    action.endsWith(".terminated") ||
    action.endsWith(".ended")
  )
    return "danger"
  if (action.endsWith(".updated") || action.endsWith(".priority_changed")) return "warning"

  return "neutral"
}

/** `rule.priority_changed` reads as "Rule priority changed". */
const humanise = (action: string): string => {
  const [entity, ...rest] = action.split(".")
  const verb = rest.join(".").replaceAll("_", " ")
  const subject = entity!.replaceAll("_", " ")

  return `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${verb}`
}

const StatePanel = ({ label, value }: { label: string; value: unknown }) => (
  <div className="flex min-w-0 flex-1 flex-col gap-1">
    <p className="text-xs font-medium text-ink-muted">{label}</p>
    <pre className="max-h-80 overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-xs text-ink">
      {value === null || value === undefined
        ? "none"
        : JSON.stringify(value, null, 2)}
    </pre>
  </div>
)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const render = (value: unknown): string =>
  value === null || value === undefined
    ? "none"
    : typeof value === "string"
      ? value
      : JSON.stringify(value)

/**
 * The answer to "what changed" is usually two fields out of twenty. Reading it
 * out of two JSON blobs is work the screen should have done, so the changed keys
 * are lifted out as diff rows and the raw states stay available underneath.
 */
const ChangedFields = ({ before, after }: { before: unknown; after: unknown }) => {
  if (!isRecord(before) || !isRecord(after)) return null

  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort()

  const changed = keys.filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  )

  if (changed.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-ink-subtle">
        No field differs between the two states.
      </p>
    )
  }

  return (
    <div className="flex flex-col rounded-md border border-border bg-surface px-2 py-1">
      {changed.map((key) => {
        const had = key in before && before[key] !== null && before[key] !== undefined
        const has = key in after && after[key] !== null && after[key] !== undefined

        return (
          <DiffRow
            key={key}
            kind={had && has ? "changed" : has ? "added" : "removed"}
            meta={
              had && has ? (
                <span className="font-mono">
                  <span className="text-status-danger">{render(before[key])}</span>
                  {" to "}
                  <span className="text-status-success">{render(after[key])}</span>
                </span>
              ) : (
                <span className="font-mono">{render(has ? after[key] : before[key])}</span>
              )
            }
          >
            <span className="text-sm text-ink">{key}</span>
          </DiffRow>
        )
      })}
    </div>
  )
}

const EventDrawer = ({
  event,
  actorName,
  onClose,
}: {
  event: AuditEventDTO | null
  actorName: (id: string | null) => string
  onClose: () => void
}) => (
  <Sheet open={event !== null} onOpenChange={(open) => !open && onClose()}>
    <SheetContent side="right" className="overflow-y-auto">
      {event ? (
        <>
          <SheetHeader>
            <SheetTitle>{humanise(event.action)}</SheetTitle>
            <SheetDescription asChild>
              <div className="flex flex-col gap-1">
                <span className="tabular text-xs text-ink-subtle">
                  {formatDayTime(event.createdAt)} by {actorName(event.actorId)}
                </span>
                <span className="font-mono text-xs text-ink-subtle">
                  {event.entityType} {event.entityId}
                </span>
              </div>
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-ink-muted">What changed</p>
              <ChangedFields before={event.beforeState} after={event.afterState} />
            </div>

            {event.metadata !== null && event.metadata !== undefined ? (
              <StatePanel label="Context" value={event.metadata} />
            ) : null}

            <details className="flex flex-col gap-1.5">
              <summary className="cursor-pointer text-xs font-medium text-ink-muted">
                Full before and after
              </summary>
              <div className="mt-2 flex flex-col gap-3">
                <StatePanel label="Before" value={event.beforeState} />
                <StatePanel label="After" value={event.afterState} />
              </div>
            </details>
          </div>
        </>
      ) : null}
    </SheetContent>
  </Sheet>
)

const AuditView = () => {
  const router = useRouter()
  const params = useSearchParams()
  const { asOf } = useAsOf()
  const { nameOf: actorName } = useActorNames()

  const [draft, setDraft] = useState(params.get("search") ?? "")
  const [open, setOpen] = useState<AuditEventDTO | null>(null)

  const page = Number(params.get("page") ?? "1")

  const filters: AuditFilters = {
    search: params.get("search") ?? undefined,
    entityType: params.get("entityType") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  }

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString())

    if (value === null || value === "" || value === "ALL") next.delete(key)
    else next.set(key, value)

    if (key !== "page") next.delete("page")

    const query = next.toString()
    router.replace(query ? `/audit?${query}` : "/audit", { scroll: false })
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (draft !== (params.get("search") ?? "")) setParam("search", draft || null)
    }, 300)

    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const query = useQuery({
    queryKey: queryKeys.auditEvents({ ...filters, page }),
    queryFn: ({ signal }) =>
      listAuditEvents(
        filters,
        { limit: DEFAULT_PAGE_SIZE, offset: (page - 1) * DEFAULT_PAGE_SIZE },
        signal,
      ),
    ...QUERY_TIERS.READ,
  })

  const total = query.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE))

  /** Group by day so a long log reads as a timeline rather than a wall. */
  const byDay = useMemo(() => {
    const days = new Map<string, AuditEventDTO[]>()

    for (const event of query.data?.items ?? []) {
      const day = event.createdAt.slice(0, 10)
      const existing = days.get(day)

      if (existing) existing.push(event)
      else days.set(day, [event])
    }

    return Array.from(days.entries())
  }, [query.data])

  return (
    <>
      <PageHeader
        title="Audit"
        description="What changed, who changed it, and what it looked like before."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 md:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden
          />
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Search actions"
            aria-label="Search audit events"
            className="pl-8"
          />
        </div>

        <Select
          value={params.get("entityType") ?? "ALL"}
          onValueChange={(value) => setParam("entityType", value)}
        >
          <SelectTrigger aria-label="Filter by entity" className="w-44">
            <SelectValue placeholder="Anything" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Anything</SelectItem>
            {ENTITY_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {type.replaceAll("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          aria-label="From date"
          className="w-40"
          value={params.get("from") ?? ""}
          onChange={(event) => setParam("from", event.target.value || null)}
        />
        <Input
          type="date"
          aria-label="To date"
          className="w-40"
          value={params.get("to") ?? ""}
          onChange={(event) => setParam("to", event.target.value || null)}
        />
      </div>

      {query.isPending ? (
        <SkeletonRows rows={10} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : total === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No audit events match these filters."
          description="Every rule edit, attribute change and assignment lands here. An empty result usually means the filter is too narrow."
          action={
            <Button size="sm" onClick={() => router.replace("/audit")}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <p className="tabular mb-2 text-xs text-ink-subtle">
            {total.toLocaleString()} event{total === 1 ? "" : "s"}
          </p>

          <div className="flex flex-col gap-4">
            {byDay.map(([day, events]) => (
              <section key={day}>
                <h2 className="tabular mb-1.5 font-mono text-xs text-ink-subtle">
                  {formatDayTime(`${day}T00:00:00.000Z`).slice(0, 12)}
                </h2>

                <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-bg">
                  {events.map((event) => (
                    <li key={event.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(event)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-150 hover:bg-surface"
                      >
                        <span className="tabular w-14 shrink-0 font-mono text-xs text-ink-subtle">
                          {event.createdAt.slice(11, 16)}
                        </span>

                        <Badge tone={ACTION_TONE(event.action)}>
                          {humanise(event.action)}
                        </Badge>

                        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">
                          {actorName(event.actorId)}
                          <span className="text-ink-subtle">
                            {" "}
                            &middot; {formatRelative(event.createdAt)}
                          </span>
                        </span>

                        <ChevronRight
                          className="size-4 shrink-0 text-ink-subtle"
                          aria-hidden
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {pages > 1 ? (
            <div className="mt-3 flex items-center justify-between">
              <span className="tabular text-xs text-ink-subtle">
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setParam("page", String(page - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={page >= pages}
                  onClick={() => setParam("page", String(page + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <EventDrawer event={open} actorName={actorName} onClose={() => setOpen(null)} />
    </>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<SkeletonRows rows={10} />}>
      <AuditView />
    </Suspense>
  )
}
