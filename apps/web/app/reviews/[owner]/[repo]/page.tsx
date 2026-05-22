import Link from "next/link"

import { getRepoPickerData } from "@/lib/diff-review"

import { AppNav, Badge, GitHubMark, IconArrowLeft, IconSlash } from "../../_components/chrome"
import { PrPicker } from "./_components/pr-picker"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface RepoPageParams {
  params: Promise<{ owner: string; repo: string }>
}

export async function generateMetadata({ params }: RepoPageParams) {
  const { owner, repo } = await params
  return {
    title: `Review a PR — ${owner}/${repo}`,
    description: `Pick a pull request on ${owner}/${repo} and get a plain-language diff review.`,
  }
}

/** The shared page header — back link, repo title, branch badge. */
function RepoPageHeader({
  owner,
  repo,
  branch,
}: {
  owner: string
  repo: string
  branch?: string
}) {
  return (
    <header>
      <Link className="back-link" href="/reviews">
        <IconArrowLeft size={14} /> Back to repositories
      </Link>
      <div className="page-eyebrow" style={{ marginTop: 24 }}>
        <span className="dot" /> Diff Review · M8
      </div>
      <div className="review-titlewrap" style={{ marginTop: 0 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {owner}/{repo}
        </h1>
        {branch && (
          <Badge soft mono>
            {branch}
          </Badge>
        )}
      </div>
      <p className="page-subtitle" style={{ marginTop: 16 }}>
        Review a pull request on this repository — or revisit a review you have
        already run.
      </p>
    </header>
  )
}

/**
 * `/reviews/[owner]/[repo]` — the PR picker (Diff Review page spec §4/§6,
 * task #116). A Server Component shell that lists the reviews already stored
 * for the repo and mounts the `PrPicker` Client Component island. When the
 * repo has no imported snapshot it renders the `not-imported` state directly.
 */
export default async function ReviewRepoPage({ params }: RepoPageParams) {
  const { owner, repo } = await params
  const data = await getRepoPickerData(owner, repo)

  if (!data.snapshotExists || !data.identity) {
    return (
      <div className="screen">
        <AppNav active="reviews" />
        <main className="page">
          <div className="container-narrow">
            <RepoPageHeader owner={owner} repo={repo} />
            <section className="status-region" role="alert">
              <div className="status-card" data-error="true">
                <div className="status-head">
                  <div className="status-icon error" aria-hidden="true">
                    <IconSlash size={18} />
                  </div>
                  <h2 className="status-title">
                    This repository isn&apos;t imported yet
                  </h2>
                </div>
                <p className="status-body">
                  We need an imported snapshot of{" "}
                  <span className="code-chip">
                    {owner}/{repo}
                  </span>{" "}
                  before we can review a pull request on it. Import it first,
                  then come back here.
                </p>
                <div className="status-actions">
                  <Link className="btn btn-primary" href="/import">
                    <GitHubMark size={14} /> Import this repository
                  </Link>
                  <Link className="btn btn-ghost" href="/reviews">
                    Browse imported repos
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="screen">
      <AppNav active="reviews" />
      <main className="page">
        <div className="container-narrow">
          <RepoPageHeader
            owner={data.identity.owner}
            repo={data.identity.repo}
            branch={data.identity.branch}
          />
          <PrPicker identity={data.identity} reviews={data.reviews} />
        </div>
      </main>
    </div>
  )
}
