import Link from "next/link"

// Shared chrome for the M9 Challenge pages (task #148). Mirrors the M5 / M8
// chrome (inline stroke SVGs, AppNav, Badge, AiLabel) so the whole app reads
// as one product. Adds a "Challenges" entry to the primary nav so the M9
// surface is reachable alongside Reviews (M8) and Map (M6).

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
export const IconArrowRight = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </StrokeIcon>
)
export const IconExternal = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </StrokeIcon>
)
export const IconLoader = (p: IconProps) => (
  <StrokeIcon {...p} className={["spin", p.className].filter(Boolean).join(" ")}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </StrokeIcon>
)
export const IconSparkles = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
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
export const IconCheck = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </StrokeIcon>
)
export const IconRefresh = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 3v6h-6" />
  </StrokeIcon>
)
export const IconFileCode = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="m10 13-2 2 2 2" />
    <path d="m14 13 2 2-2 2" />
  </StrokeIcon>
)
export const IconChevron = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="m6 9 6 6 6-6" />
  </StrokeIcon>
)
export const IconHelp = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.8" />
    <path d="M12 16h.01" />
  </StrokeIcon>
)
export const IconGauge = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M3.5 16a9 9 0 1 1 17 0" />
    <path d="m12 12 4-3" />
    <circle cx="12" cy="12" r="1.4" />
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

/** Pill badge — mirrors the M8 chrome's `Badge`. */
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

/** App nav — same shape as the M8 chrome, with a "Challenges" entry added. */
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
}) {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="nav-brand">
        <span className="mark" aria-hidden="true" />
        <span>Coach</span>
        <span className="mark-label">v0.5 · m9</span>
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
          className={active === "challenges" ? "active" : undefined}
        >
          Challenges
        </Link>
      </div>
      <div className="nav-end">
        <span className="kbd">⌘K</span>
        <span>Search</span>
      </div>
    </nav>
  )
}

/** Small, honest "AI-generated" label — real text, not just an icon. */
export function AiLabel({ children }: { children?: React.ReactNode }) {
  return (
    <span className="ai-label">
      <IconSparkles size={12} />
      {children ?? "AI-generated"}
    </span>
  )
}

/** Format a Date / ISO string as a calm relative-time line. */
export function relTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso
  const ms = Date.now() - date.getTime()
  const s = Math.round(ms / 1000)
  if (s < 60) return "just now"
  const m = Math.round(s / 60)
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`
  return date.toLocaleDateString()
}
