"use client"

import type { ReactNode } from "react"
import { ArrowRight, Equal, Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The diff row: one added / removed / changed / unchanged pattern.
 *
 * It appears in the live reconciliation feed, the employee change preview, the
 * rule impact preview and the rule version diff, so it is built once here.
 *
 * §42: the glyph is never the only signal. Every row carries a screen-reader
 * label naming the kind, and added/removed are distinguished by glyph and
 * position as well as by colour, so the row survives a monochrome print and a
 * colour-blind reader.
 */

export type DiffKind = "added" | "removed" | "changed" | "unchanged"

const KIND_META: Record<
  DiffKind,
  { label: string; glyph: typeof Plus; text: string; rail: string; bg: string }
> = {
  added: {
    label: "Added",
    glyph: Plus,
    text: "text-status-success",
    rail: "bg-status-success",
    bg: "bg-status-success-bg",
  },
  removed: {
    label: "Removed",
    glyph: Minus,
    text: "text-status-danger",
    rail: "bg-status-danger",
    bg: "bg-status-danger-bg",
  },
  changed: {
    label: "Changed",
    glyph: ArrowRight,
    text: "text-status-warning",
    rail: "bg-status-warning",
    bg: "bg-status-warning-bg",
  },
  unchanged: {
    label: "Unchanged",
    glyph: Equal,
    text: "text-ink-subtle",
    rail: "bg-border",
    bg: "bg-transparent",
  },
}

export const DiffRow = ({
  kind,
  children,
  meta,
  /** Briefly tints the row when it first appears, then settles (§38.7). */
  highlight = false,
  className,
}: {
  kind: DiffKind
  children: ReactNode
  meta?: ReactNode
  highlight?: boolean
  className?: string
}) => {
  const { label, glyph: Glyph, text, rail, bg } = KIND_META[kind]

  return (
    <div
      className={cn(
        "group/diff flex items-start gap-2 rounded-md py-1.5 pr-2 pl-0",
        highlight && "animate-diff-settle",
        className,
      )}
    >
      <span className={cn("mt-1.5 h-4 w-0.5 shrink-0 rounded-full", rail)} aria-hidden />

      <span
        className={cn(
          "mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-sm",
          bg,
          text,
        )}
      >
        <Glyph className="size-3.5" aria-hidden />
        <span className="sr-only">{label}:</span>
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="min-w-0">{children}</div>
        {meta ? <div className="text-xs text-ink-subtle">{meta}</div> : null}
      </div>
    </div>
  )
}

/** `+2  -1  =6`, the shape a reconciliation result always reports (§31.2). */
export const DiffCounts = ({
  added,
  removed,
  unchanged,
  className,
}: {
  added: number
  removed: number
  unchanged?: number
  className?: string
}) => (
  <span className={cn("tabular inline-flex items-center gap-2 text-xs", className)}>
    <span className={added > 0 ? "font-medium text-status-success" : "text-ink-subtle"}>
      +{added}
      <span className="sr-only"> added</span>
    </span>
    <span className={removed > 0 ? "font-medium text-status-danger" : "text-ink-subtle"}>
      -{removed}
      <span className="sr-only"> removed</span>
    </span>
    {unchanged !== undefined ? (
      <span className="text-ink-subtle">
        ={unchanged}
        <span className="sr-only"> unchanged</span>
      </span>
    ) : null}
  </span>
)
