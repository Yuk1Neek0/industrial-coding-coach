import { notFound } from "next/navigation"

import { loadRecommendation } from "@/lib/recommendations"

import { ResultView } from "../_components/result-view"

// The result reads a local SQLite database — render per request.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Your Recommendation",
  description:
    "A recommended Golden Path and template set, with the trade-offs and coaching narrative.",
}

/**
 * The `/recommend/[id]` result page (page spec §4–§12). A Server Component
 * that resolves the stored recommendation and every cited catalog slug, then
 * hands the resolved data to the `ResultView` Client Component, which owns the
 * read view, edit mode, and the generate-narrative action.
 */
export default async function RecommendationPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    notFound()
  }

  const data = await loadRecommendation(numericId)
  if (!data) {
    notFound()
  }

  return <ResultView data={data} />
}
