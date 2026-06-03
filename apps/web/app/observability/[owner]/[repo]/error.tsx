"use client"

import { AppNav, IconAlert } from "./_components/chrome"

/**
 * Error boundary for the M13 Observability Page (Page Spec §11 —
 * `load-failure`). Renders a friendly full-page error with a "Try again" button
 * on an unexpected data-layer throw. Expected states (no snapshot →
 * `not-found.tsx`; Part-A empty and Part-B absent → calm in-page resting states)
 * are handled separately, so this boundary only catches the unexpected. No raw
 * stack trace is shown.
 */
export default function ObservabilityError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="screen">
      <AppNav active="observability" />
      <main className="page">
        <div className="container-narrow">
          <section className="status-region" role="alert">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">
                  Couldn&apos;t load observability
                </h2>
              </div>
              <p className="status-body">
                Something went wrong reading this repository&apos;s
                observability from the local snapshot.
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
