"use client"

import { CircleAlert } from "lucide-react"

import { AppNav } from "./_components/chrome"

/** Error boundary for the catalog list route. */
export default function CatalogError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="screen">
      <AppNav active="catalog" />
      <main className="page">
        <div className="container">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Catalog · M2
            </div>
            <h1 className="page-title">Golden Path Catalog</h1>
            <p className="page-subtitle">
              Curated routes for understanding an AI-assisted project. Pick the
              one that matches yours.
            </p>
          </header>

          <div className="error-state" role="alert">
            <div className="error-head">
              <div className="error-icon" aria-hidden="true">
                <CircleAlert size={18} />
              </div>
              <div className="error-title">Couldn&apos;t load the catalog</div>
            </div>
            <div className="error-body">
              The catalog service didn&apos;t respond. This usually clears on
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
