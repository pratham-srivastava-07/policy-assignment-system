"use client"

import { useState, type ReactNode } from "react"
import { QueryClientProvider } from "@tanstack/react-query"
import { SessionProvider } from "@/lib/auth"
import { createQueryClient } from "@/lib/query"

export const Providers = ({ children }: { children: ReactNode }) => {
  const [queryClient] = useState(createQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  )
}
