"use client"

import { useId, useState } from "react"

/**
 * A keyboard-reachable progressive-disclosure island for the M13 Observability
 * Page (Page Spec §13). A real `<button>` carries `aria-expanded` +
 * `aria-controls`; the revealed region is a labelled container. This is the only
 * client component on the page — the page shell is a Server Component
 * (Page Spec §4), and this island holds no data, just open/closed UI state.
 *
 * Used for: each trace's per-turn observations + evals detail, and Part-B
 * detected-signal evidence. Reachable by keyboard (Enter/Space activate the
 * button), never hover-only.
 */
export function Disclosure({
  summary,
  children,
  className,
}: {
  /** The button label (e.g. "Details", "Evidence"). */
  summary: React.ReactNode
  /** The revealed content. */
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const regionId = useId()

  return (
    <div className={className} style={{ marginTop: 10 }}>
      <button
        type="button"
        className="hint"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((value) => !value)}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          font: "inherit",
        }}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> {summary}
      </button>
      <div
        id={regionId}
        hidden={!open}
        style={{ marginTop: 8, paddingLeft: 14 }}
      >
        {children}
      </div>
    </div>
  )
}
