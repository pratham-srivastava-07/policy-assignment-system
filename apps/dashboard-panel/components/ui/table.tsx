import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Real table semantics (§42) at §38.5 density: 40 px rows, 36 px header,
 * 8/12 cell padding. The scroll container is the table's own, so the page body
 * never scrolls sideways (§43).
 */
export const TableContainer = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "w-full overflow-x-auto rounded-md border border-border bg-bg",
      className,
    )}
    {...props}
  />
)

export const Table = ({
  className,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement>) => (
  <table className={cn("w-full border-collapse text-sm", className)} {...props} />
)

export const TableHeader = (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead {...props} />
)

export const TableBody = (props: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody {...props} />
)

export const TableRow = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr
    className={cn(
      "border-b border-border last:border-b-0 hover:bg-surface data-[state=selected]:bg-surface",
      className,
    )}
    {...props}
  />
)

export const TableHead = ({
  className,
  scope = "col",
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th
    scope={scope}
    className={cn(
      "h-9 border-b border-border bg-surface px-3 text-left text-xs font-medium text-ink-muted",
      className,
    )}
    {...props}
  />
)

export const TableCell = ({
  className,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn("h-10 px-3 py-2 align-middle text-ink", className)} {...props} />
)

export const TableCaption = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLTableCaptionElement>) => (
  <caption className={cn("sr-only", className)} {...props} />
)
