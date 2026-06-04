import { ExternalLink } from "lucide-react"
import Link from "next/link"

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

/** Top app navigation bar — shared shape with the M2 Catalog chrome. */
export function AppNav({
  active,
}: {
  active?: "home" | "catalog" | "templates"
}) {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-brand">
        <span className="mark" aria-hidden="true" />
        <span>Coach</span>
        <span className="mark-label">v0.2 · m3</span>
      </div>
      <div className="nav-links">
        <Link href="/" className={active === "home" ? "active" : undefined}>
          Home
        </Link>
        <Link
          href="/catalog"
          className={active === "catalog" ? "active" : undefined}
        >
          Catalog
        </Link>
        <Link
          href="/templates"
          className={active === "templates" ? "active" : undefined}
        >
          Templates
        </Link>
        <a href="#">Sessions</a>
        <a href="#">Docs</a>
      </div>
      <div className="nav-end">
        <span className="kbd">⌘K</span>
        <span>Search</span>
      </div>
    </nav>
  )
}
