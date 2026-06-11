// The top app navigation bar is the shared component (task #256) — the
// chrome re-exports it so existing page imports keep working.
export { AppNav } from "@/app/_components/app-nav"

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
