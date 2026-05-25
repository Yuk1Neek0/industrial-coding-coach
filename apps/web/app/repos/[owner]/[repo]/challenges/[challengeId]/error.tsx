"use client"

import { AppNav, IconAlert } from "../_components/chrome"

/**
 * Error boundary for the Challenge Detail Page (per #145's Page Spec §11 —
 * `load-failure`). Renders a friendly error with a "Try again" button on an
 * unexpected data-layer throw. Submit failures and regenerate failures are
 * handled in place by their components — never reach this boundary.
 */
export default function ChallengeDetailError({
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
                <h2 className="status-title">
                  Couldn&apos;t load this challenge
                </h2>
              </div>
              <p className="status-body">
                Something went wrong loading this challenge.
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
