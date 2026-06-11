import Link from "next/link"

import { AppNav, GitHubMark, IconSlash } from "./_components/chrome"

/**
 * `not-found.tsx` for the M12 Delivery Page (Page Spec §11 — `not-found`).
 * Triggered when `getImportedRepo(owner, repo)` returns `null` — the repository
 * hasn't been imported. Offers a direct link back to `/import` (M11 reuse).
 */
export default function DeliveryNotFound() {
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
                <h2 className="status-title">
                  This repository isn&apos;t imported yet.
                </h2>
              </div>
              <p className="status-body">
                The delivery map reads a local snapshot of an imported
                repository. Import the repository first, then come back here.
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
