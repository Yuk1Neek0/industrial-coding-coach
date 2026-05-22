import Link from "next/link"

import { listChooserRepos } from "@/lib/stack-explainer"

import { AppNav, Badge, GitHubMark, IconArrowRight, IconBox } from "./_components/chrome"
import { relTime } from "./_components/util"

// The chooser reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

export const metadata = {
  title: "Stack explanations",
  description:
    "Pick an imported repository and get a plain-language explanation of why it uses the stack it does.",
}

/**
 * `/stack` — the chooser (page spec §4/§6). A Server Component listing every
 * imported repository, each linking to its Stack Explanation page; an empty
 * state when nothing has been imported yet.
 */
export default async function StackChooserPage() {
  const repos = await listChooserRepos()

  return (
    <div className="screen">
      <AppNav active="stack" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Stack · M5
            </div>
            <h1 className="page-title">Stack explanations</h1>
            <p className="page-subtitle">
              Pick a repository you&apos;ve imported and we&apos;ll explain why
              it uses the stack it does — tied to your actual files, not a
              generic tutorial.
            </p>
          </header>

          {repos.length > 0 ? (
            <div className="repo-list" role="list">
              {repos.map((r) => (
                <Link
                  className="repo-row"
                  href={`/stack/${r.owner}/${r.repo}`}
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
                        className={`repo-state ${r.hasExplanation ? "has" : "no"}`}
                      >
                        {r.hasExplanation ? "explained" : "not explained yet"}
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
                Import a GitHub repository first, then come back here and
                we&apos;ll explain its stack.
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
