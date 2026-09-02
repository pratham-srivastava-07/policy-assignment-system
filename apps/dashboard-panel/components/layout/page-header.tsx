"use client"

import type { ReactNode } from "react"
import { formatDay, useAsOf } from "@/lib/dates"

/**
 * One `h1` per page (§42), and in historical mode the date sits beside the page
 * title on every screen (§8.1).
 */
export const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) => {
  const { asOf, historical } = useAsOf()

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {historical && asOf ? (
            <span className="tabular text-sm text-status-warning">
              as of {formatDay(asOf)}
            </span>
          ) : null}
        </div>
        {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}
