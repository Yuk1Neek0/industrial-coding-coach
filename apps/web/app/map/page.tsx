import Link from "next/link"

import { listChooserRepos } from "@/lib/project-mapper"

import {
  AppNav,
  Badge,
  GitHubMark,
  IconArrowRight,
  IconBox,
} from "./_components/chrome"
import { relTime } from "./_components/util"

// The chooser reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Project maps",
  description:
    "Pick an imported repository and get a project map — how it works as a running system, tied to your real files.",
}

/**
 * `/map` — the chooser (project-map-page spec §4/§6). A Server Component
 * listing every imported repository, each linking to its Project Map page; an
 * empty state when nothing has been imported yet.
 */
export default async function ProjectMapChooserPage() {
  const repos = await listChooserRepos()

  return (
    <div className="screen">
      <AppNav active="map" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Map · M6
            </div>
            <h1 className="page-title">Map a project</h1>
            <p className="page-subtitle">
              Pick a repository you&apos;ve imported and we&apos;ll map how it
              works as a running system — the architecture, the key files, the
              flows, and where to start debugging — all tied to your real
              files.
            </p>
          </header>

          {repos.length > 0 ? (
            <div className="repo-list" role="list">
              {repos.map((r) => (
                <Link
                  className="repo-row"
                  href={`/map/${r.owner}/${r.repo}`}
                  role="listitem"
                  key={`${r.owner}/${r.repo}`}
                >
                  <span className="repo-icon" aria-hidden="true">
                    <GitHubMark size={20} />
                  </span>
                  <div>
                    <div className="repo-name">
                      {r.owner}/{r.repo}
                    </div>
                    <div className="repo-meta">
                      <Badge soft mono>
                        {r.branch}
                      </Badge>
                      <span className="repo-state mono">
                        imported {relTime(r.importedAt)}
                      </span>
                      <span
                        className={`repo-state ${r.hasMap ? "has" : "no"}`}
                      >
                        {r.hasMap ? "mapped" : "not mapped yet"}
                      </span>
                    </div>
                  </div>
                  <span className="repo-cta" aria-hidden="true">
                    <IconArrowRight size={16} />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div
              className="empty-state"
              role="status"
              style={{ marginTop: 56, padding: "80px 32px" }}
            >
              <div className="empty-icon" aria-hidden="true">
                <IconBox size={22} />
              </div>
              <div className="empty-title">No repositories imported yet</div>
              <div className="empty-body">
                Import a GitHub repository first, then come back here to get a
                project map.
              </div>
              <div className="empty-actions">
                <Link className="btn btn-primary" href="/import">
                  <GitHubMark size={14} /> Import a repository
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
