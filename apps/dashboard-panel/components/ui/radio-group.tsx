"use client"

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group"
import { cn } from "@/lib/utils"

export const RadioGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) => (
  <RadioGroupPrimitive.Root className={cn("grid gap-2", className)} {...props} />
)

export const RadioGroupItem = ({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) => (
  <RadioGroupPrimitive.Item
    className={cn(
      "flex size-4 shrink-0 items-center justify-center rounded-full border border-border bg-bg transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-accent",
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-accent" />
  </RadioGroupPrimitive.Item>
)
