// Shared chrome for the M7 Issue Learning Workspace pages
// (issue-based-learning-workspace epic, task #138). The icons are inline
// stroke SVGs — the same approach the M5 / M8 pages use — so the UI stays
// pixel-faithful regardless of the installed lucide-react release. The top
// app navigation bar is the shared component (task #256) — the chrome
// re-exports it so existing page imports keep working.
export { AppNav } from "@/app/_components/app-nav"

/** Props common to every stroke icon. */
type IconProps = {
  size?: number
  className?: string
}

/** A 24×24 stroke icon. */
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

export const IconArrowRight = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </StrokeIcon>
)
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
export const IconFileCode = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="m10 13-2 2 2 2" />
    <path d="m14 13 2 2-2 2" />
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
export const IconCheck = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </StrokeIcon>
)
export const IconBox = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M3 7h18v13H3z" />
    <path d="M3 7l9-4 9 4" />
    <path d="M3 12h18" />
  </StrokeIcon>
)
export const IconSlash = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m5 5 14 14" />
  </StrokeIcon>
)
export const IconClipboard = (p: IconProps) => (
  <StrokeIcon {...p}>
    <rect x="6" y="4" width="12" height="16" rx="2" />
    <path d="M9 4v-1h6v1" />
    <path d="M9 10h6M9 14h6M9 18h4" />
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
export const IconBeaker = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M9 3h6" />
    <path d="M10 3v6.5L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-8.5V3" />
    <path d="M7.5 14h9" />
  </StrokeIcon>
)
export const IconLock = (p: IconProps) => (
  <StrokeIcon {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </StrokeIcon>
)

/** The GitHub logo mark — lucide-react no longer ships brand icons. */
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

/** The design's pill badge. `soft` = filled accent; `mono` = monospace. */
export function Badge({
  children,
  soft,
  mono,
  tone,
}: {
  children: React.ReactNode
  soft?: boolean
  mono?: boolean
  /** Optional semantic tone, drives the badge color. */
  tone?:
    | "open"
    | "closed"
    | "not-started"
    | "in-progress"
    | "scored"
    | "info"
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

/** A small, honest "AI-generated" label (ADR 0005). Real text, not an icon. */
export function AiLabel({ children }: { children?: React.ReactNode }) {
  return (
    <span className="ai-label">
      <IconSparkles size={12} />
      {children ?? "AI-generated learning unit"}
    </span>
  )
}

/** Human-friendly relative time for "imported 3 hours ago" / "graded just now". */
export function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const seconds = Math.max(0, Math.floor((now - then) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`
  return new Date(iso).toLocaleDateString()
}

/** Map a learning-unit status to a Badge tone + readable label. */
export function statusBadge(
  status: "not started" | "in progress" | "scored",
): { tone: "not-started" | "in-progress" | "scored"; label: string } {
  switch (status) {
    case "scored":
      return { tone: "scored", label: "Scored" }
    case "in progress":
      return { tone: "in-progress", label: "In progress" }
    default:
      return { tone: "not-started", label: "Not started" }
  }
}
