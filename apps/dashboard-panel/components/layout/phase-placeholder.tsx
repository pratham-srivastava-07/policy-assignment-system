import { Layers } from "lucide-react"
import { EmptyState } from "@/components/ui"

/**
 * Scaffolding. Each of these is replaced by the phase named on it; nothing here
 * fakes data or a control that does not work yet.
 */
export const PhasePlaceholder = ({ phase, builds }: { phase: number; builds: string }) => (
  <EmptyState
    icon={Layers}
    title={`Phase ${phase}`}
    description={`${builds} This screen is not built yet.`}
  />
)
