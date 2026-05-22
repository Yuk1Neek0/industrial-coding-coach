import { CircleSlash, Sparkles } from "lucide-react"
import Link from "next/link"

import { AppNav } from "../_components/chrome"

/** Shown when a recommendation id does not exist (page spec §11). */
export default function RecommendationNotFound() {
  return (
    <div className="screen">
      <AppNav active="recommend" />
      <main className="page">
        <div className="container-narrow">
          <div className="empty-state" style={{ padding: "96px 32px" }}>
            <div className="empty-icon" aria-hidden="true">
              <CircleSlash size={22} />
            </div>
            <div className="empty-title">Recommendation not found</div>
            <div className="empty-body">
              We couldn&apos;t find a recommendation at that address. It may have
              been deleted, or the link is out of date.
            </div>
            <div className="empty-actions">
              <Link className="btn btn-primary" href="/recommend">
                <Sparkles size={14} />
                Get a recommendation
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
