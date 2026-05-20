import { notFound } from "next/navigation"

import { getCatalogPath } from "@/lib/catalog"

import { DetailView } from "../_components/detail-view"

// The catalog reads a local SQLite database — render per request.
export const dynamic = "force-dynamic"

export default async function GoldenPathPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const path = await getCatalogPath(slug)

  if (!path) {
    notFound()
  }

  return <DetailView path={path} />
}
