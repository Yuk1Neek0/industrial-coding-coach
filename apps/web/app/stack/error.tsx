"use client"

// Route error boundary for /stack (page spec §4/§11). Covers ONLY unexpected
// render-time failures of the route itself — expected explanation failures
// (not imported, missing API key, unrecognized stack, LLM failure) are in-page
// error states handled inside the explanation flow, not here.

import { AppNav, IconAlert } from "./_components/chrome"

export default function StackError({ reset }: { reset: () => void }) {
  return (
    <div className="screen">
      <AppNav active="stack" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Stack · M5
            </div>
            <h1 className="page-title">Stack explanations</h1>
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
                The stack page hit an unexpected error. This is usually
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
