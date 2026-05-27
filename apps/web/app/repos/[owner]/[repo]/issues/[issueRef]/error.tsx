"use client"

// Route error boundary for the Issue Learning Workspace page (page spec §11).

import { AppNav, IconAlert } from "../../../../_components/chrome"

export default function WorkspaceError({ reset }: { reset: () => void }) {
  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Issue learning · M7
            </div>
            <h1 className="page-title">Learning unit</h1>
          </header>
          <section className="status-region">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">
                  Couldn&apos;t load this learning unit
                </h2>
              </div>
              <p className="status-body">
                This is usually temporary — try reloading. Your saved answers
                and checklist state are not affected.
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
