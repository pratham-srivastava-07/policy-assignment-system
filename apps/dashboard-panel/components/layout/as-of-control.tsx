"use client"

import { CalendarDays } from "lucide-react"
import { Button } from "@/components/ui"
import { formatDay, isIsoDay, todayIso, useAsOf } from "@/lib/dates"

/** §8. `As of: <day>`; the date leaves the URL entirely when it is today. */
export const AsOfControl = () => {
  const { asOf, setAsOf, historical } = useAsOf()

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="as-of"
        className="flex items-center gap-1.5 text-xs text-ink-subtle"
      >
        <CalendarDays className="size-4" aria-hidden />
        <span className="hidden md:inline">As of</span>
      </label>
      <input
        id="as-of"
        type="date"
        value={asOf ?? todayIso()}
        onChange={(event) => {
          const value = event.target.value
          setAsOf(value && isIsoDay(value) ? value : null)
        }}
        className="tabular h-8 rounded-md border border-border bg-bg px-2 text-xs text-ink"
      />
      {historical ? (
        <Button size="sm" variant="ghost" onClick={() => setAsOf(null)}>
          Today
        </Button>
      ) : null}
    </div>
  )
}

/**
 * §8.1: historical mode is persistent and unmissable, because every write
 * control is hidden while it is on.
 */
export const HistoricalModeBanner = () => {
  const { asOf, setAsOf, historical } = useAsOf()

  if (!historical || asOf === null) return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-status-warning-bg px-4 py-2 text-xs text-status-warning md:px-6"
    >
      <span className="font-medium">Viewing {formatDay(asOf)}</span>
      <span>
        Editing is unavailable in historical mode. Employee attributes shown elsewhere
        are current values.
      </span>
      <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAsOf(null)}>
        Return to today
      </Button>
    </div>
  )
}
