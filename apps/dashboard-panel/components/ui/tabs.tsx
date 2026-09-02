"use client"

import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

export const Tabs = TabsPrimitive.Root

export const TabsList = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List
    className={cn("flex items-center gap-1 border-b border-border", className)}
    {...props}
  />
)

export const TabsTrigger = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "-mb-px h-9 border-b-2 border-transparent px-3 text-sm font-medium text-ink-muted transition-colors duration-150 ease-out hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink",
      className,
    )}
    {...props}
  />
)

export const TabsContent = ({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) => (
  <TabsPrimitive.Content className={cn("pt-4", className)} {...props} />
)
