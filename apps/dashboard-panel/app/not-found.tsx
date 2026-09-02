import Link from "next/link"
import { Button } from "@/components/ui"

/** §40.3 `NOT_FOUND`: a route-level not-found with a link back. */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-ink">Not found</h1>
      <p className="text-sm text-ink-muted">
        That page does not exist, or the record it points at has been removed.
      </p>
      <Button asChild variant="secondary">
        <Link href="/employees">Back to Employees</Link>
      </Button>
    </div>
  )
}
