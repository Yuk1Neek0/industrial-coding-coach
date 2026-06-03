// Chrome for the M13 Observability Page (`/observability/[owner]/[repo]`,
// task #227). Mirrors the M12 Delivery chrome (inline stroke SVGs, AppNav,
// Badge) so the whole app reads as one product. Adds an "Observability" entry
// to the primary nav, alongside the M12 "Delivery" entry. The unifying nav pass
// across milestones remains an unscoped follow-up — until then each milestone's
// chrome carries its own copy with its own active state (same note as the
// M10/M11/M12 chrome).

import Link from "next/link"

type IconProps = {
  size?: number
  className?: string
}

function StrokeIcon({
  size = 16,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconArrowLeft = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </StrokeIcon>
)
export const IconExternal = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </StrokeIcon>
)
export const IconAlert = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5" />
    <path d="M12 16h.01" />
  </StrokeIcon>
)
export const IconSlash = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5 5 14 14" />
  </StrokeIcon>
)
export const IconRefresh = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
  </StrokeIcon>
)
export const IconCheck = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M20 6 9 17l-5-5" />
  </StrokeIcon>
)
export const IconX = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </StrokeIcon>
)
export const IconDot = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="9" />
  </StrokeIcon>
)

/** The GitHub logo mark. */
export function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.29 9.41 7.86 10.94.58.1.79-.25.79-.56v-1.97c-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.24 3.34.95.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.26 5.68.41.35.78 1.05.78 2.12v3.14c0 .31.21.67.8.56C20.22 21.42 23.5 17.11 23.5 12.02 23.5 5.66 18.35.5 12 .5z" />
    </svg>
  )
}

/** Pill badge — mirrors the M8/M9/M10/M12 chrome's `Badge`. */
export function Badge({
  children,
  soft,
  mono,
  tone,
}: {
  children: React.ReactNode
  soft?: boolean
  mono?: boolean
  tone?: "neutral" | "ok" | "warn" | "bad"
}) {
  const className = [
    "badge",
    soft && "badge-soft",
    mono && "badge-mono",
    tone && `badge-${tone}`,
  ]
    .filter(Boolean)
    .join(" ")
  return (
    <span className={className}>
      {!soft && !tone && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  )
}

/** App nav — same shape as the M12 chrome, with an "Observability" entry added. */
export function AppNav({
  active,
}: {
  active?:
    | "home"
    | "catalog"
    | "templates"
    | "import"
    | "stack"
    | "reviews"
    | "challenges"
    | "portfolio"
    | "delivery"
    | "observability"
}) {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-brand">
        <span className="mark" aria-hidden="true" />
        <span>Coach</span>
        <span className="mark-label">v0.8 · m13</span>
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
          href="/stack"
          className={active === "stack" ? "active" : undefined}
        >
          Stack
        </Link>
        <Link
          href="/reviews"
          className={active === "reviews" ? "active" : undefined}
        >
          Reviews
        </Link>
        <Link
          href="/import"
          className={active === "portfolio" ? "active" : undefined}
        >
          Portfolio
        </Link>
        <Link
          href="/import"
          className={active === "delivery" ? "active" : undefined}
        >
          Delivery
        </Link>
        <Link
          href="/import"
          className={active === "observability" ? "active" : undefined}
        >
          Observability
        </Link>
      </div>
      <div className="nav-end">
        <span className="kbd">⌘K</span>
        <span>Search</span>
      </div>
    </nav>
  )
}
