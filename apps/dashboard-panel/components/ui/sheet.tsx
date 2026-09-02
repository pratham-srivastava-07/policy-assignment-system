"use client"

import * as DialogPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The drawer surface. §43: 480 px on desktop, 560 px wide, full-screen on
 * mobile. Built on Dialog so focus trapping and Esc come for free (§42).
 */
export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close

const sheetVariants = cva(
  "fixed z-50 flex flex-col gap-4 border-border bg-bg shadow-lg",
  {
    variants: {
      side: {
        left: "inset-y-0 left-0 h-full w-72 max-w-[85vw] border-r data-[state=open]:animate-sheet-in-left",
        right:
          "inset-y-0 right-0 h-full w-full border-l md:w-[480px] xl:w-[560px] data-[state=open]:animate-sheet-in-right",
      },
    },
    defaultVariants: { side: "right" },
  },
)

export const SheetContent = ({
  className,
  side,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> &
  VariantProps<typeof sheetVariants>) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-overlay-in" />
    <DialogPrimitive.Content
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className="absolute top-4 right-4 rounded-sm text-ink-subtle transition-colors duration-150 hover:text-ink"
        aria-label="Close"
      >
        <X className="size-4" aria-hidden />
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
)

export const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-1 border-b border-border p-4", className)}
    {...props}
  />
)

export const SheetTitle = ({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title
    className={cn("text-lg font-semibold text-ink", className)}
    {...props}
  />
)

export const SheetDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description
    className={cn("text-sm text-ink-muted", className)}
    {...props}
  />
)
