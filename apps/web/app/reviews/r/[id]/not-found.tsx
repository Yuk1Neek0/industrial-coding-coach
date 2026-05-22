import Link from "next/link"

import { AppNav, IconSlash, IconSparkles } from "../../_components/chrome"

/** Shown when a review id does not exist or is invalid (spec §11). */
export default function DiffReviewNotFound() {
  return (
    <div className="screen">
      <AppNav active="reviews" />
      <main className="page">
        <div className="container-narrow">
          <div className="empty-state" style={{ padding: "96px 32px" }}>
            <div className="empty-icon" aria-hidden="true">
              <IconSlash size={22} />
            </div>
            <div className="empty-title">Review not found</div>
            <div className="empty-body">
              We couldn&apos;t find a diff review at that address. It may have
              been deleted, or the link is out of date.
            </div>
            <div className="empty-actions">
              <Link className="btn btn-primary" href="/reviews">
                <IconSparkles size={14} />
                Browse diff reviews
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
