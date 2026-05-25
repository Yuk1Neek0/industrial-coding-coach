import Link from "next/link"
import { notFound } from "next/navigation"

import { getIssuesPageData } from "@/lib/learning-units"

import {
  AppNav,
  Badge,
  GitHubMark,
  IconAlert,
  IconArrowLeft,
  IconBox,
  IconExternal,
  relTime,
  statusBadge,
} from "../../../_components/chrome"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface IssuesPageParams {
  params: Promise<{ owner: string; repo: string }>
}

export async function generateMetadata({ params }: IssuesPageParams) {
  const { owner, repo } = await params
  return {
    title: `Issues — ${owner}/${repo}`,
    description:
      `Pick an issue or CCPM task on ${owner}/${repo} to open its learning unit.`,
  }
}

/**
 * `/repos/[owner]/[repo]/issues` — the Per-repo Issues List page
 * (page spec `docs/design/per-repo-issues-list.page-spec.md`, FR-11, R5).
 *
 * Lists every fetched GitHub Issue and CCPM task in the imported snapshot,
 * each annotated with its `learning_units` status (not started / in progress
 * / scored). Reaches the Issue Learning Workspace at
 * `/repos/[owner]/[repo]/issues/[issueRef]` for one click.
 */
export default async function IssuesListPage({ params }: IssuesPageParams) {
  const { owner, repo } = await params
  const data = await getIssuesPageData(owner, repo)

  if (!data.snapshotExists || !data.identity) {
    notFound()
  }

  const { identity, rows, fetchFailed, fetchError, truncated } = data
  const ghUrl = `https://github.com/${identity.owner}/${identity.repo}`

  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <Link className="back-link" href="/import">
              <IconArrowLeft size={14} /> Back to imported repos
            </Link>
            <div className="page-eyebrow" style={{ marginTop: 24 }}>
              <span className="dot" /> Issue learning · M7
            </div>
            <h1 className="page-title">Issues</h1>
            <p className="page-subtitle">
              Pick an issue to open its learning unit — coaching grounded in
              this repo, not generic advice.
            </p>
            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                fontSize: 13,
                color: "var(--fg-muted)",
              }}
            >
              <span>
                {identity.owner}/{identity.repo}
              </span>
              <Badge soft mono>
                {identity.branch}
              </Badge>
              <a
                href={ghUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
              >
                View on GitHub <IconExternal size={12} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <span style={{ marginLeft: "auto" }}>
                {rows.length} issue{rows.length === 1 ? "" : "s"}
              </span>
            </div>
          </header>

          {fetchFailed && (
            <p className="inline-note inline-warn" style={{ marginTop: 18 }}>
              <IconAlert size={15} />
              Couldn&apos;t fetch fresh issues from GitHub
              {fetchError ? ` — ${fetchError}` : ""}. Showing CCPM tasks from
              the imported snapshot only. Set <span className="mono">
                GITHUB_TOKEN
              </span> for the higher authenticated rate limit.
            </p>
          )}

          {truncated && (
            <p className="inline-note" style={{ marginTop: 12 }}>
              <IconAlert size={15} />
              This repo has more issues than the page cap; only the first
              batch is shown.
            </p>
          )}

          {rows.length > 0 ? (
            <ul className="issues-list" aria-label="Issues">
              {rows.map((row) => {
                const status = statusBadge(row.status)
                const stateBadge = row.state === "open" ? "Open" : "Closed"
                const accessibleName = `${stateBadge} ${row.source === "ccpm-task" ? "CCPM task" : "issue"} ${row.issueRef} — ${row.title} — ${status.label}`
                return (
                  <li key={`${row.source}:${row.issueRef}`}>
                    <Link
                      className="issue-row"
                      href={row.href}
                      aria-label={accessibleName}
                    >
                      <span className="issue-state-col">
                        <Badge
                          tone={row.state === "open" ? "open" : "closed"}
                        >
                          {stateBadge}
                        </Badge>
                        <Badge tone="info">
                          {row.source === "ccpm-task" ? "CCPM" : "GitHub"}
                        </Badge>
                      </span>
                      <span className="issue-main">
                        <span className="issue-ref">{row.issueRef}</span>
                        <span className="issue-title">{row.title}</span>
                        {(row.labels.length > 0 ||
                          row.linkedPrs.length > 0) && (
                          <span className="issue-meta">
                            {row.labels.slice(0, 4).map((label) => (
                              <Badge key={label} tone="info">
                                {label}
                              </Badge>
                            ))}
                            {row.labels.length > 4 && (
                              <Badge tone="info">+{row.labels.length - 4} more</Badge>
                            )}
                            {row.linkedPrs.length > 0 && (
                              <Badge soft mono>
                                {row.linkedPrs.length === 1
                                  ? `PR #${row.linkedPrs[0]}`
                                  : `${row.linkedPrs.length} linked PRs`}
                              </Badge>
                            )}
                          </span>
                        )}
                      </span>
                      <span className="issue-status-col">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {row.lastUpdatedAt && (
                          <span className="issue-status-meta">
                            Updated {relTime(row.lastUpdatedAt)}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="empty-state" role="status">
              <div aria-hidden="true">
                <IconBox size={22} />
              </div>
              <div className="empty-title">No issues to learn from yet.</div>
              <p className="empty-body">
                We didn&apos;t find any GitHub Issues on this repo, and no CCPM
                task files are present in the imported snapshot. A project with
                no issues yet is not a failure — when you open one on GitHub or
                create CCPM tasks under{" "}
                <span className="mono">.claude/epics/</span>, re-import to
                refresh.
              </p>
              <div>
                <a
                  className="btn btn-primary"
                  href={ghUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GitHubMark size={14} /> Open the repo on GitHub
                </a>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
