import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Label } from "./label"

/**
 * Field-level messages come only from the client's own Zod schema. The server
 * has no per-field error map (§40.2), so nothing else feeds this.
 */
export const Field = ({
  id,
  label,
  hint,
  error,
  children,
  className,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}) => (
  <div className={cn("flex flex-col gap-1.5", className)}>
    <Label htmlFor={id}>{label}</Label>
    {children}
    {error ? (
      <p id={`${id}-error`} className="text-xs text-status-danger">
        {error}
      </p>
    ) : hint ? (
      <p id={`${id}-hint`} className="text-xs text-ink-subtle">
        {hint}
      </p>
    ) : null}
  </div>
)
