// Stale-data banner for the M10 Portfolio Page (Page Spec §6a / FR-11).
// Rendered above the in-page anchor nav only when `isMemoryStale(snapshotId)`
// returns `true` AND a memory row exists — the empty-row case uses the §10
// empty panel instead. A real-text region (not a color-only signal); the
// icon is decorative and the heading carries the meaning.

import { IconClock } from "./chrome"
import { RegenerateButton } from "./regenerate-button"

interface StaleBannerProps {
  snapshotId: number
}

export function StaleBanner({ snapshotId }: StaleBannerProps) {
  return (
    <section
      className="status-region"
      role="status"
      aria-live="polite"
      aria-label="Memory may be out of date"
    >
      <div className="status-card">
        <div className="status-head">
          <div className="status-icon" aria-hidden="true">
            <IconClock size={18} />
          </div>
          <h2 className="status-title">
            Your learning memory may be out of date.
          </h2>
        </div>
        <p className="status-body">
          This repository&apos;s snapshot was updated after this memory was
          last generated. Click <strong>Regenerate memory</strong> to refresh
          the artifacts from your latest M5–M9 outputs.
        </p>
        <div className="status-actions">
          <RegenerateButton
            snapshotId={snapshotId}
            variant="secondary"
            label="Regenerate memory"
          />
        </div>
      </div>
    </section>
  )
}
