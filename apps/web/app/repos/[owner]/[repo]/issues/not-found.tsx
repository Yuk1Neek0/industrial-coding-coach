import Link from "next/link"

import {
  AppNav,
  GitHubMark,
  IconAlert,
  IconArrowLeft,
} from "../../../_components/chrome"

/**
 * `/repos/[owner]/[repo]/issues/not-found.tsx` — shown when the repo is not
 * imported (page spec `docs/design/per-repo-issues-list.page-spec.md` §11).
 * Distinct from a load failure (handled by `error.tsx`) so the user gets a
 * calm, actionable next step.
 */
export default function IssuesNotFound() {
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
            <h1 className="page-title">Repo not imported</h1>
          </header>
          <section className="status-region" role="alert">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">
                  This repository hasn&apos;t been imported yet.
                </h2>
              </div>
              <p className="status-body">
                We need an imported snapshot of the repository before we can
                list its issues and run a learning unit on them. Import it
                first, then come back here.
              </p>
              <div className="status-actions">
                <Link className="btn btn-primary" href="/import">
                  <GitHubMark size={14} /> Import this repository
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
