"use client"

import * as LabelPrimitive from "@radix-ui/react-label"
import { cn } from "@/lib/utils"

export const Label = ({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) => (
  <LabelPrimitive.Root
    className={cn("text-sm font-medium text-ink", className)}
    {...props}
  />
)
