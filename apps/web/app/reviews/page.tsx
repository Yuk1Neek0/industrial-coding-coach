import Link from "next/link"

import { listChooserRepos } from "@/lib/diff-review"

import { AppNav, Badge, GitHubMark, IconArrowRight, IconBox } from "./_components/chrome"
import { relTime } from "./_components/util"

// The chooser reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Diff reviews",
  description:
    "Pick an imported repository and review a pull request on it — what each file changed, the risks, and a comprehension check.",
}

/**
 * `/reviews` — the repository chooser (Diff Review page spec §6, task #116). A
 * Server Component listing every imported repository, each linking to its PR
 * picker; an empty state when nothing has been imported yet.
 */
export default async function ReviewsChooserPage() {
  const repos = await listChooserRepos()

  return (
    <div className="screen">
      <AppNav active="reviews" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Diff Review · M8
            </div>
            <h1 className="page-title">Diff reviews</h1>
            <p className="page-subtitle">
              Pick a repository you&apos;ve imported and review a pull request
              on it — what each file changed, what could break, and a
              comprehension check so you can defend the change in an interview.
            </p>
          </header>

          {repos.length > 0 ? (
            <ul className="repo-list" aria-label="Imported repositories">
              {repos.map((r) => (
                <li key={`${r.owner}/${r.repo}`}>
                  <Link className="repo-row" href={`/reviews/${r.owner}/${r.repo}`}>
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
                          className={`repo-state ${r.reviewCount > 0 ? "has" : "no"}`}
                        >
                          {r.reviewCount > 0
                            ? `${r.reviewCount} review${r.reviewCount === 1 ? "" : "s"}`
                            : "no reviews yet"}
                        </span>
                      </div>
                    </div>
                    <span className="repo-cta" aria-hidden="true">
                      <IconArrowRight size={16} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
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
                Import a GitHub repository first, then come back here to review
                a pull request on it.
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
