import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * §38.4 status tokens. §42: a badge's colour is never its only signal, so the
 * label text is required and the caller may pass an icon alongside it.
 */
const badgeVariants = cva(
  "inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        success: "bg-status-success-bg text-status-success",
        warning: "bg-status-warning-bg text-status-warning",
        danger: "bg-status-danger-bg text-status-danger",
        neutral: "bg-status-neutral-bg text-status-neutral",
        info: "bg-status-info-bg text-status-info",
        outline: "border border-border bg-transparent text-ink-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, tone, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ tone }), className)} {...props} />
)

export { badgeVariants }
