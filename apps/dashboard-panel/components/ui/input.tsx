import * as React from "react"
import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = ({ className, type = "text", ...props }: InputProps) => (
  <input
    type={type}
    className={cn(
      "h-9 w-full rounded-md border border-border bg-bg px-3 text-sm text-ink transition-colors duration-150 ease-out placeholder:text-ink-subtle disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
)
