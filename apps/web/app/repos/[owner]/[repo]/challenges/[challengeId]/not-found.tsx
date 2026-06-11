import Link from "next/link"

import { AppNav, IconSlash } from "../_components/chrome"

/**
 * The not-found UI for the Challenge Detail Page — rendered when the
 * `challengeId` does not resolve or its snapshot identity doesn't match
 * the route's `owner`/`repo` (per #145's Page Spec §11).
 */
export default function ChallengeDetailNotFound() {
  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <section className="status-region" role="alert">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconSlash size={18} />
                </div>
                <h2 className="status-title">Challenge not found</h2>
              </div>
              <p className="status-body">
                This challenge does not exist or has been regenerated. Return
                to the challenge list to pick another.
              </p>
              <div className="status-actions">
                <Link className="btn btn-primary" href="/import">
                  Back to imported repositories
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
