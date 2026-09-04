"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, Info } from "lucide-react"
import type { AssignmentDTO } from "@policy/shared"
import {
  Badge,
  ErrorState,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from "@/components/ui"
import { useExplanation, useGroupNames } from "@/features/reference/hooks"
import { formatDay, formatDayTime } from "@/lib/dates"
import { ResolutionTrail } from "./resolution-trail"

/**
 * "Why does this employee have this policy?" (design.md §14).
 *
 * Opens immediately with the assignment header the caller already holds, and
 * loads the trail underneath, so the user never watches an empty panel (§40.1).
 */

export interface ExplanationTarget {
  assignment: AssignmentDTO
  subject: string
}

export const ExplanationDrawer = ({
  target,
  onClose,
}: {
  target: ExplanationTarget | null
  onClose: () => void
}) => {
  const assignment = target?.assignment ?? null
  const subject = target?.subject ?? "This employee"
  const explanation = useExplanation(assignment?.id ?? null)
  const { nameOf: groupName } = useGroupNames()
  const [showOthers, setShowOthers] = useState(false)

  const trail = explanation.data?.trail ?? []

  // §14.5: the explanation returns every rule considered in that evaluation,
  // across all categories. Unfiltered, a question about meal-break training
  // would list the pay-schedule rules underneath it.
  const own = assignment
    ? trail.filter((entry) => entry.categoryId === assignment.categoryId)
    : []
  const others = assignment
    ? trail.filter((entry) => entry.categoryId !== assignment.categoryId)
    : []

  const currentVersion = explanation.data?.sourceRuleVersion.version
  const staleVersion =
    assignment !== null &&
    currentVersion !== undefined &&
    assignment.sourceRuleVersion !== currentVersion

  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="overflow-y-auto">
        {assignment ? (
          <>
            <SheetHeader>
              <SheetTitle>Why does {subject} have this policy?</SheetTitle>
              <SheetDescription asChild>
                <div className="flex flex-col gap-1">
                  <span className="text-base font-medium text-ink">
                    {assignment.policyName}
                  </span>
                  <span className="tabular text-xs text-ink-subtle">
                    {assignment.categoryName} &middot; {assignment.cardinality} &middot;
                    effective {formatDay(assignment.effectiveFrom)}
                    {assignment.effectiveTo
                      ? ` to ${formatDay(assignment.effectiveTo)}`
                      : " onward"}
                  </span>
                </div>
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-4 px-4 pb-6">
              {assignment.resolutionStatus === "MANUAL_OVERRIDE" ? (
                <div className="flex items-start gap-2 rounded-md bg-status-info-bg px-3 py-2 text-sm text-status-info">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    This is a manual override. It won because it out-ranked the automatic
                    rules below, not because an override always wins.
                  </span>
                </div>
              ) : null}

              {staleVersion ? (
                <div className="flex items-start gap-2 rounded-md bg-status-warning-bg px-3 py-2 text-sm text-status-warning">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="tabular">
                    Assigned by rule v{assignment.sourceRuleVersion}. The current rule is v
                    {currentVersion}. {subject} has not been reconciled since it changed.
                  </span>
                </div>
              ) : null}

              {explanation.isPending ? (
                <div className="flex flex-col gap-2" role="status" aria-label="Loading">
                  <Skeleton className="h-4 w-56" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : explanation.error ? (
                <ErrorState error={explanation.error} onRetry={() => explanation.refetch()} />
              ) : (
                <>
                  {/* §14.6: the trail is the MOST RECENT evaluation that touched this
                      assignment, not the one that created it. Labelling it with its
                      own date is what keeps the panel truthful. */}
                  <p className="text-xs text-ink-subtle">
                    Decisions from the evaluation of{" "}
                    {formatDayTime(explanation.data!.assignment.updatedAt)}
                  </p>

                  <ResolutionTrail
                    entries={own}
                    cardinality={assignment.cardinality}
                    subject={subject}
                    groupName={groupName}
                  />

                  {others.length > 0 ? (
                    <div className="border-t border-border pt-2">
                      <button
                        type="button"
                        onClick={() => setShowOthers((open) => !open)}
                        aria-expanded={showOthers}
                        className="flex w-full items-center gap-1.5 rounded-sm py-1 text-left text-sm text-accent transition-colors duration-150 hover:underline"
                      >
                        {showOthers ? (
                          <ChevronDown className="size-4" aria-hidden />
                        ) : (
                          <ChevronRight className="size-4" aria-hidden />
                        )}
                        {showOthers ? "Hide" : "Show"} {others.length} decision
                        {others.length === 1 ? "" : "s"} from other policy categories
                      </button>

                      {showOthers ? (
                        <ResolutionTrail
                          entries={others}
                          cardinality={assignment.cardinality}
                          subject={subject}
                          groupName={groupName}
                          className="mt-1"
                        />
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-1 rounded-md border border-border p-3">
                    <span className="text-xs font-medium text-ink-muted">
                      The rule as it stood when this was assigned
                    </span>
                    <span className="text-sm text-ink">
                      {explanation.data!.sourceRuleVersion.name}
                    </span>
                    <span className="tabular text-xs text-ink-subtle">
                      v{explanation.data!.sourceRuleVersion.version} &middot;{" "}
                      {explanation.data!.sourceRuleVersion.ruleType} &middot; priority{" "}
                      {explanation.data!.sourceRuleVersion.priority}
                    </span>
                    <Badge
                      tone={explanation.data!.sourceRuleVersion.enabled ? "success" : "neutral"}
                      className="mt-1 self-start"
                    >
                      {explanation.data!.sourceRuleVersion.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                </>
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
