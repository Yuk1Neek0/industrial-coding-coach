"use client"

// Route error boundary for the /repos hub (M17, task #267, page spec §11).
// Covers unexpected render-time failures of the local SQLite reads — an empty
// catalog is the page's empty state, not an error.

import { AppNav, IconAlert } from "./_components/chrome"

export default function ReposHubError({ reset }: { reset: () => void }) {
  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Repo hub · M17
            </div>
            <h1 className="page-title">Repos</h1>
          </header>
          <section className="status-region">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">
                  Couldn&apos;t load imported repositories
                </h2>
              </div>
              <p className="status-body">
                This is usually temporary — try reloading.
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
