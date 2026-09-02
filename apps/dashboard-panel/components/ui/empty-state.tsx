import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** §40.6: an empty state names the next action. `action` is not decoration. */
export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border px-6 py-12 text-center",
      className,
    )}
  >
    {Icon ? <Icon className="size-5 text-ink-subtle" aria-hidden /> : null}
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="max-w-md text-sm text-ink-muted">{description}</p>
      ) : null}
    </div>
    {action}
  </div>
)
