import Link from "next/link"

/** The design's pill badge — a plain bordered tag with an accent dot. */
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="badge">
      <span className="badge-dot" aria-hidden="true" />
      {children}
    </span>
  )
}

/** Top app navigation bar — shared shape with the M2 Catalog / M3 Registry. */
export function AppNav({
  active,
}: {
  active?: "home" | "catalog" | "templates" | "import" | "recommend"
}) {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-brand">
        <span className="mark" aria-hidden="true" />
        <span>Coach</span>
        <span className="mark-label">v0.2 · m4</span>
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
        <Link
          href="/import"
          className={active === "import" ? "active" : undefined}
        >
          Import
        </Link>
        <Link
          href="/recommend"
          className={active === "recommend" ? "active" : undefined}
        >
          Recommend
        </Link>
      </div>
      <div className="nav-end">
        <span className="kbd">⌘K</span>
        <span>Search</span>
      </div>
    </nav>
  )
}
