import Link from "next/link"

import {
  AppNav,
  IconAlert,
  IconArrowLeft,
} from "../../../../_components/chrome"

/** Not-found UI for an unknown repo or invalid issueRef (page spec §11). */
export default function WorkspaceNotFound() {
  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <Link className="back-link" href="/import">
            <IconArrowLeft size={14} /> Back to imported repos
          </Link>
          <header style={{ marginTop: 24 }}>
            <div className="page-eyebrow">
              <span className="dot" /> Issue learning · M7
            </div>
            <h1 className="page-title">Learning unit not found</h1>
          </header>
          <section className="status-region" role="alert">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">
                  We couldn&apos;t find a learning unit for that reference.
                </h2>
              </div>
              <p className="status-body">
                Either the repo has not been imported, the issue / CCPM task
                identifier is malformed, or no matching record exists in the
                snapshot.
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
