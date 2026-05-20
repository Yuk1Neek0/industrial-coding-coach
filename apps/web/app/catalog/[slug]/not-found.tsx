import { ArrowLeft, CircleSlash } from "lucide-react"
import Link from "next/link"

import { AppNav } from "../_components/chrome"

/** Shown when a Golden Path slug does not exist. */
export default function GoldenPathNotFound() {
  return (
    <div className="screen">
      <AppNav active="catalog" />
      <main className="page page-narrow">
        <div className="container-narrow">
          <Link className="back-link" href="/catalog">
            <ArrowLeft size={14} />
            Back to catalog
          </Link>

          <div className="empty-state tall" role="status">
            <div className="empty-icon" aria-hidden="true">
              <CircleSlash size={22} />
            </div>
            <div className="empty-title">Golden Path not found</div>
            <div className="empty-body">
              We couldn&apos;t find a Golden Path at that address. It may have
              been renamed, or the link is out of date.
            </div>
            <div className="empty-actions">
              <Link className="btn btn-primary" href="/catalog">
                Back to catalog
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
