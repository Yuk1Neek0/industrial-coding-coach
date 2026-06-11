"use client"

import { AppNav, IconAlert } from "./_components/chrome"

/**
 * Error boundary for the M12 Delivery Page (Page Spec §11 — `load-failure`).
 * Renders a friendly full-page error with a "Try again" button on an unexpected
 * data-layer throw. Expected states (no snapshot → `not-found.tsx`; non-CCPM
 * repo → the in-page educational state) are handled separately, so this
 * boundary only catches the unexpected.
 */
export default function DeliveryError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <section className="status-region" role="alert">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">
                  Couldn&apos;t load the delivery map
                </h2>
              </div>
              <p className="status-body">
                Something went wrong reading this repository&apos;s delivery
                map from the local snapshot.
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
