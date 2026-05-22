"use client"

import { CircleAlert } from "lucide-react"

import { AppNav } from "./_components/chrome"

/** Error boundary for the `/recommend` intake route. */
export default function RecommendError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="screen">
      <AppNav active="recommend" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Recommend · M4
            </div>
            <h1 className="page-title">Get a recommendation</h1>
          </header>

          <div className="error-state" role="alert">
            <div className="error-head">
              <div className="error-icon" aria-hidden="true">
                <CircleAlert size={18} />
              </div>
              <div className="error-title">Something went wrong</div>
            </div>
            <div className="error-body">
              The recommendation page hit an unexpected error. This usually
              clears on a retry.
            </div>
            <div className="error-actions">
              <button type="button" className="btn btn-primary" onClick={reset}>
                Try again
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
