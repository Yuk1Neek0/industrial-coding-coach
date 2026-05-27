"use client"

import { AppNav, IconAlert } from "./_components/chrome"

/**
 * Error boundary for the Challenge List Page (Page Spec §11 — `load-failure`).
 * Renders a friendly error with a "Try again" button on an unexpected data-
 * layer throw. Expected failures (no snapshot, no project map) render as
 * in-page status cards on the page itself; this boundary catches everything
 * else without leaking a stack trace.
 */
export default function ChallengeListError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="screen">
      <AppNav active="challenges" />
      <main className="page">
        <div className="container-narrow">
          <section className="status-region" role="alert">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">Couldn&apos;t load challenges</h2>
              </div>
              <p className="status-body">
                Something went wrong loading this repository&apos;s challenges.
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
