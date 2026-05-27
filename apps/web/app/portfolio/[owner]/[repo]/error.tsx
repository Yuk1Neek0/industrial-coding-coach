"use client"

import { AppNav, IconAlert } from "./_components/chrome"

/**
 * Error boundary for the M10 Portfolio Page (Page Spec §11 — `load-failure`).
 * Renders a friendly full-page error with a "Try again" button on an
 * unexpected data-layer throw. Expected failures (no snapshot →
 * `not-found.tsx`; no memory yet → in-page empty panel; missing API key →
 * inline next to Regenerate) are handled separately so this boundary only
 * catches the unexpected.
 */
export default function PortfolioError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="screen">
      <AppNav active="portfolio" />
      <main className="page">
        <div className="container-narrow">
          <section className="status-region" role="alert">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">
                  Couldn&apos;t load your learning memory
                </h2>
              </div>
              <p className="status-body">
                Something went wrong reading this repository&apos;s learning
                memory.
              </p>
              <div className="status-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => reset()}
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
