import { cn } from "@/lib/utils"

/** §38.7: a static tinted block. Deliberately not a shimmer. */
export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    aria-hidden
    className={cn("rounded-md bg-surface", className)}
    {...props}
  />
)

/** §40.1: skeleton rows match the real row height so nothing shifts on load. */
export const SkeletonRows = ({ rows = 6 }: { rows?: number }) => (
  <div className="flex flex-col gap-px" role="status" aria-label="Loading">
    {Array.from({ length: rows }, (_, index) => (
      <Skeleton key={index} className="h-10 w-full" />
    ))}
  </div>
)
