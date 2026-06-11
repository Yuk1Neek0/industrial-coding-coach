"use client"

// Route error boundary for /repos/[owner]/[repo]/files (task #268, spec §11).
// Covers unexpected render-time failures only — a not-imported repo renders
// `not-found.tsx`, and an unknown `?path` is an in-page state, not an error.

import { AppNav, IconAlert } from "../../../_components/chrome"

export default function FilesError({ reset }: { reset: () => void }) {
  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Snapshot files · M17
            </div>
            <h1 className="page-title">Snapshot files</h1>
          </header>
          <section className="status-region">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">
                  Couldn&apos;t load this snapshot
                </h2>
              </div>
              <p className="status-body">
                Reading the local snapshot failed unexpectedly. This is
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
