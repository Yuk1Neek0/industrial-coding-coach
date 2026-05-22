"use client"

import { ArrowLeft, CircleAlert } from "lucide-react"
import Link from "next/link"

import { AppNav } from "../_components/chrome"

/** Error boundary for a recommendation result route (page spec §11). */
export default function RecommendationError({
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
          <Link className="back-link" href="/recommend">
            <ArrowLeft size={14} />
            Get another recommendation
          </Link>

          <div className="error-state" role="alert">
            <div className="error-head">
              <div className="error-icon" aria-hidden="true">
                <CircleAlert size={18} />
              </div>
              <div className="error-title">
                Couldn&apos;t load this recommendation
              </div>
            </div>
            <div className="error-body">
              Something went wrong while reading the recommendation. This
              usually clears on a retry; if it keeps happening, the local
              database might not be reachable.
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
