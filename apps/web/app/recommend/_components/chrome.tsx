// The top app navigation bar is the shared component (task #256) — the
// chrome re-exports it so existing page imports keep working.
export { AppNav } from "@/app/_components/app-nav"

/** The design's pill badge — a plain bordered tag with an accent dot. */
export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="badge">
      <span className="badge-dot" aria-hidden="true" />
      {children}
    </span>
  )
}
