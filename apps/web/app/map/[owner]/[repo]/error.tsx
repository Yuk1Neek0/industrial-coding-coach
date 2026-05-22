"use client"

// Route error boundary for /map/[owner]/[repo] (project-map-page spec §4/§11).
// Covers ONLY unexpected render-time failures of the route — expected mapping
// failures (not-imported, missing-api-key, empty-snapshot, pipeline-failure)
// are in-page error states handled inside `MapFlow`.

import { AppNav, IconAlert } from "../../_components/chrome"

export default function ProjectMapError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="screen">
      <AppNav active="map" />
      <main className="page">
        <div className="container-narrow">
          <header className="map-header">
            <div className="page-eyebrow">
              <span className="dot" /> Project map
            </div>
            <h1 className="page-title" style={{ fontSize: 30 }}>
              Project map
            </h1>
          </header>

          <section className="status-region">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">Something went wrong</h2>
              </div>
              <p className="status-body">
                The project map page hit an unexpected error. This is usually
                temporary — try reloading.
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
