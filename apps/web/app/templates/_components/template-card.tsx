import { ArrowUpRight } from "lucide-react"
import Link from "next/link"

import type { Template } from "@workspace/db"

import { Badge, SourceBadge } from "./chrome"

/**
 * A single template card in the registry grid — the whole card is one link.
 *
 * The fit indicator is the plain factor count: the stored `fitFactors` carry no
 * weight, so there is no "N strong" cue (see the #48 integration notes).
 */
export function TemplateCard({ template }: { template: Template }) {
  const factorCount = template.fitFactors.length
  return (
    <Link
      className="card"
      href={`/templates/${template.slug}`}
      aria-label={template.name}
    >
      <span className="card-arrow" aria-hidden="true">
        <ArrowUpRight size={16} />
      </span>
      <div className="card-meta">
        <Badge>{template.category}</Badge>
        <SourceBadge source={template.source} sourceUrl={template.sourceUrl} />
      </div>
      <h2 className="card-title">{template.name}</h2>
      <p className="card-summary">{template.summary}</p>
      <div className="card-foot">
        <span className="slug">{template.slug}</span>
        <span className="fit-indicator">
          Fit: {factorCount} factor{factorCount === 1 ? "" : "s"}
        </span>
      </div>
    </Link>
  )
}
