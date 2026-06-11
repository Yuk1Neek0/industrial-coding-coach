import Link from "next/link"

// The single shared top app navigation bar (integration-polish epic, task
// #256). Every feature chrome re-exports this component instead of carrying
// its own copy, so the nav lists each real top-level route exactly once —
// no dead links, no fake affordances. Repo-scoped pages (issues, challenges,
// portfolio, delivery, observability) highlight "repos".

/** The feature areas the primary nav can highlight. */
export type AppNavArea =
  | "home"
  | "catalog"
  | "templates"
  | "recommend"
  | "stack"
  | "map"
  | "repos"
  | "reviews"
  | "import"

const NAV_LINKS: { area: AppNavArea; href: string; label: string }[] = [
  { area: "home", href: "/", label: "Home" },
  { area: "catalog", href: "/catalog", label: "Catalog" },
  { area: "templates", href: "/templates", label: "Templates" },
  { area: "recommend", href: "/recommend", label: "Recommend" },
  { area: "stack", href: "/stack", label: "Stack" },
  { area: "map", href: "/map", label: "Map" },
  { area: "repos", href: "/repos", label: "Repos" },
  { area: "reviews", href: "/reviews", label: "Reviews" },
  { area: "import", href: "/import", label: "Import" },
]

/** Top app navigation bar — shared by every feature chrome. */
export function AppNav({ active }: { active?: AppNavArea }) {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-brand">
        <span className="mark" aria-hidden="true" />
        <span>Coach</span>
      </div>
      <div className="nav-links">
        {NAV_LINKS.map(({ area, href, label }) => (
          <Link
            key={area}
            href={href}
            className={active === area ? "active" : undefined}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
