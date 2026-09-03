import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"

/**
 * One typeface family for the whole product.
 *
 * Geist is a grotesque with a genuine monospace sibling, which matters here more
 * than it usually does: priorities, tenure figures, effective dates and rule
 * versions all need tabular alignment beside prose that must not look like a
 * terminal. Two faces from one family gives that without the seam a mismatched
 * pairing leaves.
 */
const sans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
})

const mono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Policy",
  description:
    "Define assignment rules once. Every employee resolves to the right policies, deterministically, with the reason attached.",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full ${sans.variable} ${mono.variable}`}>
      {/* Extensions commonly write attributes onto body before React hydrates. */}
      <body className="min-h-full" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
