"use client"

import { CircleAlert } from "lucide-react"

import { AppNav } from "./_components/chrome"

/** Error boundary for the Template Registry list route. */
export default function TemplatesError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="screen">
      <AppNav active="templates" />
      <main className="page">
        <div className="container">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Registry · M3
            </div>
            <h1 className="page-title">Template Registry</h1>
            <p className="page-subtitle">
              The building blocks behind the Golden Paths. Browse the templates
              a project is built on and see how each one fits.
            </p>
          </header>

          <div className="error-state" role="alert">
            <div className="error-head">
              <div className="error-icon" aria-hidden="true">
                <CircleAlert size={18} />
              </div>
              <div className="error-title">Couldn&apos;t load the registry</div>
            </div>
            <div className="error-body">
              The registry service didn&apos;t respond. This usually clears on
              retry; if it keeps happening, the local database might not be
              reachable.
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
