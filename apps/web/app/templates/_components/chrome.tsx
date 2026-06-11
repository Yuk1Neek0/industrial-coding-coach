import { ExternalLink } from "lucide-react"

// The top app navigation bar is the shared component (task #256) — the
// chrome re-exports it so existing page imports keep working.
export { AppNav } from "@/app/_components/app-nav"

/**
 * Provenance badge. Renders only for imported templates (`source: 'backstage'`)
 * — curated entries show nothing, so they read as internally curated. On the
 * detail page (`asLink`) it links to the upstream `template.yaml`; on cards it
 * is a plain span (the whole card is already a link — no nested anchors).
 */
export function SourceBadge({
  source,
  sourceUrl,
  asLink = false,
}: {
  source: "curated" | "backstage"
  sourceUrl?: string | null
  asLink?: boolean
}) {
  if (source !== "backstage") return null
  const inner = (
    <>
      <span className="badge-dot" aria-hidden="true" />
      Source: Backstage
      {asLink && sourceUrl ? (
        <ExternalLink size={11} aria-hidden="true" />
      ) : null}
    </>
  )
  if (asLink && sourceUrl) {
    return (
      <a
        className="badge badge-source"
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {inner}
      </a>
    )
  }
  return <span className="badge badge-source">{inner}</span>
}

/** The design's pill badge. `soft` = filled accent; `mono` = monospace. */
export function Badge({
  children,
  soft,
  mono,
}: {
  children: React.ReactNode
  soft?: boolean
  mono?: boolean
}) {
  const className = ["badge", soft && "badge-soft", mono && "badge-mono"]
    .filter(Boolean)
    .join(" ")
  return (
    <span className={className}>
      {!soft && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  )
}
