import type { Metadata } from "next"
import { UnavailablePanel } from "./unavailable-panel"

export const metadata: Metadata = { title: "Not available · Policy" }

export default function UnavailablePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <UnavailablePanel />
      </div>
    </div>
  )
}
