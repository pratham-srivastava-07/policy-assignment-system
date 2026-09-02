"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { LoaderCircle } from "lucide-react"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border text-sm font-medium transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-accent text-accent-ink hover:bg-accent-hover",
        secondary:
          "border-border bg-bg text-ink hover:bg-surface",
        ghost: "border-transparent bg-transparent text-ink-muted hover:bg-surface hover:text-ink",
        danger:
          "border-transparent bg-status-danger text-white hover:opacity-90",
        link: "h-auto border-transparent bg-transparent p-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-2.5",
        default: "h-9 px-3",
        icon: "size-9 p-0",
      },
    },
    defaultVariants: { variant: "secondary", size: "default" },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = ({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) => {
  if (asChild) {
    return (
      <Slot className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    )
  }

  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}

export { buttonVariants }
