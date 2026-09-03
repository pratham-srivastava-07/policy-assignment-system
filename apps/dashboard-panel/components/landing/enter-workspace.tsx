"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { useSession } from "@/lib/auth"
import { Button } from "@/components/ui"
import { cn } from "@/lib/utils"

/**
 * One label for one intent, in the nav and in the hero. Where it lands depends
 * on whether this tab already holds a session, so a signed-in admin is never
 * sent back through a login form they do not need.
 */
export const EnterWorkspace = ({
  variant = "primary",
  className,
}: {
  variant?: "primary" | "ghost"
  className?: string
}) => {
  const { status } = useSession()
  const href = status === "authenticated" ? "/employees" : "/login"

  return (
    <Button
      asChild
      variant={variant}
      size={variant === "primary" ? "default" : "sm"}
      className={cn(variant === "primary" && "px-4", className)}
    >
      <Link href={href}>
        Open the workspace
        {variant === "primary" ? <ArrowRight aria-hidden /> : null}
      </Link>
    </Button>
  )
}
