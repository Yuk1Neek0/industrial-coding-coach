// Shared chrome for the M10 Portfolio Page (`/portfolio/[owner]/[repo]`,
// task #184). Mirrors the M9 Challenge chrome at
// `apps/web/app/repos/[owner]/[repo]/challenges/_components/chrome.tsx` so
// the whole app reads as one product (inline stroke SVGs, Badge, AiLabel).
// The top app navigation bar is the shared component (task #256) — the
// chrome re-exports it so existing page imports keep working; portfolio
// pages highlight "repos".
export { AppNav } from "@/app/_components/app-nav"

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
export const IconLoader = (p: IconProps) => (
  <StrokeIcon
    {...p}
    className={["spin", p.className].filter(Boolean).join(" ")}
  >
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
export const IconClock = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
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
export const IconDownload = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </StrokeIcon>
)
export const IconExternal = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
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

/** Pill badge — mirrors the M8/M9 chrome's `Badge`. */
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

/** Map an M5/M6/M7/M8/M9 source row to a route-relative href the page links to. */
export function sourceHref(
  source: { milestone: "M5" | "M6" | "M7" | "M8" | "M9"; rowId: number },
  owner: string,
  repo: string,
): string {
  // M9 surfaces challenges by `/challenges/[challengeId]`; the leaf's row id
  // for M9 is the challenge id (composer line 296). For M7/M8 we link back
  // to the per-feature list — the deep link to the row needs the row's
  // issueRef / PR number which the leaf shape does not carry. The list
  // pages let the user find the row easily; the integration notes (this
  // task) document the trade-off so future M10-touching work knows.
  switch (source.milestone) {
    case "M5":
      return `/stack`
    case "M6":
      return `/map/${owner}/${repo}`
    case "M7":
      return `/repos/${owner}/${repo}/issues`
    case "M8":
      return `/reviews`
    case "M9":
      return `/repos/${owner}/${repo}/challenges/${source.rowId}`
  }
}
