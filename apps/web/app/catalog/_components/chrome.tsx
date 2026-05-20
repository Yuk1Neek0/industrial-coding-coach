import Link from "next/link"

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

/** Top app navigation bar. */
export function AppNav({ active = "catalog" }: { active?: "home" | "catalog" }) {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-brand">
        <span className="mark" aria-hidden="true" />
        <span>Coach</span>
        <span className="mark-label">v0.2 · m2</span>
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
        <a href="#">Templates</a>
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
