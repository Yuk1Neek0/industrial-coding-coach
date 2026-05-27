"use client"

// Route error boundary for /repos/[owner]/[repo]/issues (task #138). Covers
// unexpected render-time failures of the list route — a not-imported repo is
// rendered by `not-found.tsx`, not here.

import { AppNav, IconAlert } from "../../../_components/chrome"

export default function IssuesError({ reset }: { reset: () => void }) {
  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Issue learning · M7
            </div>
            <h1 className="page-title">Issues</h1>
          </header>
          <section className="status-region">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">
                  Couldn&apos;t load issues for this repo
                </h2>
              </div>
              <p className="status-body">
                This is usually temporary — try reloading. If GitHub access
                failed, set <span className="mono">GITHUB_TOKEN</span> and try
                again.
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
