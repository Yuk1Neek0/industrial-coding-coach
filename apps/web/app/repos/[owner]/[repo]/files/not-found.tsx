import Link from "next/link"

import {
  AppNav,
  GitHubMark,
  IconAlert,
  IconArrowLeft,
} from "../../../_components/chrome"

/**
 * `/repos/[owner]/[repo]/files/not-found.tsx` — shown when the repo is not
 * imported (spec §11), matching the sibling issues/challenges not-found
 * pages. This is the only `notFound()` on this route: an unknown `?path` is
 * an in-page state (§6c-iii), never a 404.
 */
export default function FilesNotFound() {
  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <Link className="back-link" href="/repos">
            <IconArrowLeft size={14} /> All repos
          </Link>
          <header style={{ marginTop: 24 }}>
            <div className="page-eyebrow">
              <span className="dot" /> Snapshot files · M17
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
                The file viewer reads a local snapshot, so we need an imported
                snapshot of the repository before we can show its file tree
                and captured key files. Import it first, then come back here.
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
