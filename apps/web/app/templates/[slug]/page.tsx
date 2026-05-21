import { notFound } from "next/navigation"

import { getTemplate } from "@/lib/templates"

import { TemplateDetailView } from "../_components/detail-view"

// The registry reads a local SQLite database — render per request.
export const dynamic = "force-dynamic"

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const template = await getTemplate(slug)

  if (!template) {
    notFound()
  }

  return <TemplateDetailView template={template} />
}
