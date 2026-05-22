"use client"

// Route error boundary for /reviews/r/[id] (Diff Review page spec §11). Covers a
// load failure of the review's data layer — a friendly "Try again". An unknown
// id is handled separately by not-found.tsx; a grading failure is handled
// inside the Understanding Check, not here.

import { AppNav, IconAlert } from "../../_components/chrome"

export default function DiffReviewError({ reset }: { reset: () => void }) {
  return (
    <div className="screen">
      <AppNav active="reviews" />
      <main className="page">
        <div className="container-narrow">
          <section className="status-region" style={{ marginTop: 56 }}>
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">Couldn&apos;t load this review</h2>
              </div>
              <p className="status-body">
                Something went wrong while reading this diff review. This is
                usually temporary — try again.
              </p>
              <div className="status-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={reset}
                >
                  Try again
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
