import Link from "next/link"

import { getStackPageData } from "@/lib/stack-explainer"

import {
  AppNav,
  Badge,
  GitHubMark,
  IconArrowLeft,
  IconSlash,
} from "../../_components/chrome"
import { StackExplainerFlow } from "./_components/stack-explainer-flow"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface StackPageParams {
  params: Promise<{ owner: string; repo: string }>
}

export async function generateMetadata({ params }: StackPageParams) {
  const { owner, repo } = await params
  return {
    title: `Stack explanation — ${owner}/${repo}`,
    description: `Why ${owner}/${repo} uses the technology stack it does, explained against its actual files.`,
  }
}

/** The shared page header — back link, repo title, branch badge. */
function StackPageHeader({
  owner,
  repo,
  branch,
}: {
  owner: string
  repo: string
  branch?: string
}) {
  return (
    <header className="stack-header">
      <Link className="back-link" href="/stack">
        <IconArrowLeft size={14} /> Back to stack explanations
      </Link>
      <div className="page-eyebrow" style={{ marginTop: 24 }}>
        <span className="dot" /> Stack explanation
      </div>
      <div className="stack-titlewrap">
        <h1 className="page-title">
          {owner}/{repo}
        </h1>
        {branch && (
          <Badge soft mono>
            {branch}
          </Badge>
        )}
      </div>
      <p className="page-subtitle">
        Why this project uses the stack it does — explained against its actual
        files.
      </p>
    </header>
  )
}

/**
 * `/stack/[owner]/[repo]` — the Stack Explanation page (page spec §4/§6). A
 * Server Component shell that reads any persisted explanation and mounts the
 * `StackExplainerFlow` Client Component island. When the repo has no imported
 * snapshot, it renders the `not-imported` state directly — no flow to mount.
 */
export default async function StackExplanationPage({
  params,
}: StackPageParams) {
  const { owner, repo } = await params
  const data = await getStackPageData(owner, repo)

  if (!data.snapshotExists || !data.identity) {
    return (
      <div className="screen">
        <AppNav active="stack" />
        <main className="page">
          <div className="container-narrow">
            <StackPageHeader owner={owner} repo={repo} />
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
                  before we can read its files and explain the stack. Import it
                  first, then come back here.
                </p>
                <div className="status-actions">
                  <Link className="btn btn-primary" href="/import">
                    <GitHubMark size={14} /> Import this repository
                  </Link>
                  <Link className="btn btn-ghost" href="/stack">
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
      <AppNav active="stack" />
      <main className="page">
        <div className="container-narrow">
          <StackPageHeader
            owner={data.identity.owner}
            repo={data.identity.repo}
            branch={data.identity.branch}
          />
          <StackExplainerFlow
            identity={data.identity}
            initialExplanation={data.explanation}
          />
        </div>
      </main>
    </div>
  )
}
