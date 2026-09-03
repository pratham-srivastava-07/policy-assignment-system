"use client"

import { Suspense, use } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { PageHeader } from "@/components/layout"
import { Button, ErrorState, SkeletonRows } from "@/components/ui"
import { QUERY_TIERS, queryKeys } from "@/lib/query"
import { useAsOf, withAsOf } from "@/lib/dates"
import { getRule } from "@/features/rules/api"
import { RuleEditor } from "@/features/rules/rule-editor"

const EditView = ({ id }: { id: string }) => {
  const { asOf } = useAsOf()

  const rule = useQuery({
    queryKey: queryKeys.rule(id),
    queryFn: ({ signal }) => getRule(id, signal),
    ...QUERY_TIERS.READ,
  })

  if (rule.isPending) return <SkeletonRows rows={8} />
  if (rule.error) return <ErrorState error={rule.error} onRetry={() => rule.refetch()} />

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link href={withAsOf(`/rules/${id}`, asOf)}>
          <ArrowLeft aria-hidden />
          {rule.data!.name}
        </Link>
      </Button>

      <PageHeader
        title="Edit rule"
        description="Saving writes a new version. Assignments already made keep pointing at the version that produced them."
      />

      <RuleEditor rule={rule.data!} />
    </>
  )
}

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  return (
    <Suspense fallback={<SkeletonRows rows={8} />}>
      <EditView id={id} />
    </Suspense>
  )
}
