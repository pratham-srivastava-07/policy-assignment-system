"use client"

import { useState } from "react"
import { ChevronDown, LogOut } from "lucide-react"
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui"
import { useSession } from "@/lib/auth"
import { ROLE_LABELS } from "@/lib/permissions"

export const UserMenu = () => {
  const { session, signOut } = useSession()
  const [signingOut, setSigningOut] = useState(false)

  if (!session) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <span className="max-w-40 truncate">{session.user.name}</span>
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block truncate text-ink">{session.user.email}</span>
          <span className="block">{ROLE_LABELS[session.role]}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault()
            setSigningOut(true)
            void signOut()
          }}
        >
          <LogOut aria-hidden />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
