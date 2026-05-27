// Empty-memory panel for the M10 Portfolio Page (Page Spec §10 — first-open
// shape). Rendered inline in `page.tsx` when `getMemory` returns `null`.
// Offers a primary "Generate memory" button that invokes the same
// regenerate Server Action as the header.

import { RegenerateButton } from "./regenerate-button"

interface PortfolioEmptyProps {
  snapshotId: number
}

export function PortfolioEmpty({ snapshotId }: PortfolioEmptyProps) {
  return (
    <section className="status-region">
      <div className="status-card">
        <div className="status-head">
          <h2 className="status-title">
            No learning memory yet for this repository
          </h2>
        </div>
        <p className="status-body">
          M10 caches your portfolio artifacts on first generation, then keeps
          serving them until you click Regenerate. Generate the memory once;
          subsequent views read the cache without an API key.
        </p>
        <div className="status-actions">
          <RegenerateButton
            snapshotId={snapshotId}
            variant="first-open"
            label="Generate memory"
          />
        </div>
      </div>
    </section>
  )
}
