"use client"

// Route error boundary for /reviews/[owner]/[repo] (task #116). Covers ONLY
// unexpected render-time failures — expected review failures (not imported,
// missing API key, GitHub / LLM failure) are in-page states in the PR picker.

import { AppNav, IconAlert } from "../../_components/chrome"

export default function ReviewRepoError({ reset }: { reset: () => void }) {
  return (
    <div className="screen">
      <AppNav active="reviews" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Diff Review · M8
            </div>
            <h1 className="page-title">Review a pull request</h1>
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
                This page hit an unexpected error. This is usually temporary —
                try reloading.
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
