// Shared chrome for the Stack Explainer pages (task #89). The icons replicate
// the Claude Design handoff's inline SVGs verbatim, so the UI stays
// pixel-faithful to the approved design rather than depending on a particular
// lucide-react release. The top app navigation bar is the shared component
// (task #256) — the chrome re-exports it so existing page imports keep working.
export { AppNav } from "@/app/_components/app-nav"

/** Props common to every stroke icon. */
type IconProps = {
  size?: number
  className?: string
}

/** A 24×24 stroke icon — the design's `SIcon` helper. */
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

export const IconLayers = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="m12 2 10 5-10 5L2 7l10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </StrokeIcon>
)
export const IconBriefcase = (p: IconProps) => (
  <StrokeIcon {...p}>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 13h18" />
  </StrokeIcon>
)
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
export const IconArrowLR = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M8 3 4 7l4 4" />
    <path d="M4 7h16" />
    <path d="m16 21 4-4-4-4" />
    <path d="M20 17H4" />
  </StrokeIcon>
)
export const IconShuffle = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M16 3h5v5" />
    <path d="M4 20 21 3" />
    <path d="M21 16v5h-5" />
    <path d="m15 15 6 6" />
    <path d="M4 4l5 5" />
  </StrokeIcon>
)
export const IconBug = (p: IconProps) => (
  <StrokeIcon {...p}>
    <rect x="8" y="6" width="8" height="14" rx="4" />
    <path d="M19 7l-3 2" />
    <path d="M5 7l3 2" />
    <path d="M19 13h-3" />
    <path d="M5 13h3" />
    <path d="M19 19l-3-2" />
    <path d="M5 19l3-2" />
    <path d="M12 2v4" />
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
export const IconBox = (p: IconProps) => (
  <StrokeIcon {...p}>
    <path d="M3 7h18v13H3z" />
    <path d="M3 7l9-4 9 4" />
    <path d="M3 12h18" />
  </StrokeIcon>
)
export const IconKey = (p: IconProps) => (
  <StrokeIcon {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m10.85 12.15 8.65-8.65" />
    <path d="M18 5l2 2" />
    <path d="m15 8 2 2" />
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
