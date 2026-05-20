import { ArrowUpRight, List } from "lucide-react"
import Link from "next/link"

import type { GoldenPath } from "@workspace/db"

import { Badge } from "./chrome"

/** A single Golden Path card in the catalog grid — the whole card is a link. */
export function PathCard({ path }: { path: GoldenPath }) {
  return (
    <Link className="card" href={`/catalog/${path.slug}`} aria-label={path.name}>
      <span className="card-arrow" aria-hidden="true">
        <ArrowUpRight size={16} />
      </span>
      <div className="card-meta">
        <Badge>{path.targetProjectType}</Badge>
      </div>
      <h2 className="card-title">{path.name}</h2>
      <p className="card-summary">{path.summary}</p>
      <div className="card-foot">
        <span className="slug">{path.slug}</span>
        <span className="steps">
          <List size={13} />
          {path.steps.length} steps
        </span>
      </div>
    </Link>
  )
}
