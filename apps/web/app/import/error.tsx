"use client"

// Route error boundary for /import (page spec §4/§11). This covers ONLY
// unexpected render-time failures of the route itself — expected import
// failures (invalid URL, not found, rate limit, auth) are in-page error states
// handled inside `ImportFlow`, not here.

import { AlertTriangle } from "lucide-react"

import { AppNav } from "./_components/chrome"

export default function ImportError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="screen">
      <AppNav active="import" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Import · M11
            </div>
            <h1 className="page-title">Import a GitHub Repository</h1>
          </header>

          <section className="status-region">
            <div className="status-card" data-error-kind="unknown">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <AlertTriangle size={18} />
                </div>
                <h2 className="status-title">Something went wrong</h2>
              </div>
              <p className="status-body">
                The import page hit an unexpected error. This is usually
                temporary — try reloading the page.
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
