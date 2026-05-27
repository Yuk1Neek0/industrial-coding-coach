import Link from "next/link"

import { getChallengeListPageData } from "@/lib/challenges"

import {
  AiLabel,
  AppNav,
  Badge,
  GitHubMark,
  IconArrowLeft,
  IconArrowRight,
  IconSlash,
  relTime,
} from "./_components/chrome"
import { ChallengeListGenerateButton } from "./_components/list-row"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface ChallengeListParams {
  params: Promise<{ owner: string; repo: string }>
}

export async function generateMetadata({ params }: ChallengeListParams) {
  const { owner, repo } = await params
  return {
    title: `Challenges — ${owner}/${repo}`,
    description: `Project-tied debug and expansion challenges for ${owner}/${repo}, grounded in its project map.`,
  }
}

/**
 * `/repos/[owner]/[repo]/challenges` — the Challenge List Page (Page Spec
 * §4 / §6, task #148). A Server Component shell that reads the cached M9
 * challenges for the imported snapshot plus the M6 project map (read-only —
 * the list view never triggers generation per R2). Each row names the
 * target file(s)/module(s) from the M6 project map (US-1) and surfaces the
 * user's latest 0–100 outcome (R5). Types that do not apply to the snapshot
 * are omitted (R1 / R6) — they are not in `applicableChallengeTypes`.
 */
export default async function ChallengeListPage({
  params,
}: ChallengeListParams) {
  const { owner, repo } = await params
  const data = await getChallengeListPageData(owner, repo)

  if (!data.snapshotExists || !data.identity) {
    return (
      <div className="screen">
        <AppNav active="challenges" />
        <main className="page">
          <div className="container-narrow">
            <ChallengeListHeader owner={owner} repo={repo} />
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
                  Project-tied challenges need an imported snapshot of{" "}
                  <span className="code-chip">
                    {owner}/{repo}
                  </span>
                  . Import it first, then come back here.
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

  if (!data.projectMapExists) {
    return (
      <div className="screen">
        <AppNav active="challenges" />
        <main className="page">
          <div className="container-narrow">
            <ChallengeListHeader
              owner={data.identity.owner}
              repo={data.identity.repo}
              branch={data.identity.branch}
            />
            <section className="status-region" role="alert">
              <div className="status-card" data-error="true">
                <div className="status-head">
                  <div className="status-icon error" aria-hidden="true">
                    <IconSlash size={18} />
                  </div>
                  <h2 className="status-title">
                    No project map yet for this snapshot
                  </h2>
                </div>
                <p className="status-body">
                  Challenges are generated from your project map. The map needs
                  to exist first.
                </p>
                <div className="status-actions">
                  <Link
                    className="btn btn-primary"
                    href={`/map/${data.identity.owner}/${data.identity.repo}`}
                  >
                    Map this project
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    )
  }

  const entries = data.entries
  const identity = data.identity

  return (
    <div className="screen">
      <AppNav active="challenges" />
      <main className="page">
        <div className="container-narrow">
          <ChallengeListHeader
            owner={identity.owner}
            repo={identity.repo}
            branch={identity.branch}
          />

          {entries.length === 0 ? (
            <section className="status-region">
              <div className="status-card">
                <div className="status-head">
                  <h2 className="status-title">
                    No applicable challenges for this snapshot yet
                  </h2>
                </div>
                <p className="status-body">
                  M9 only generates challenges whose target files are in your
                  project map. Types like &quot;explain a broken CI result&quot;
                  appear once a real failing CI run is surfaced (M10).
                </p>
                <div className="status-actions">
                  <Link
                    className="btn btn-ghost"
                    href={`/map/${identity.owner}/${identity.repo}`}
                  >
                    View project map
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <section
              className="review-section"
              aria-labelledby="sec-challenges"
            >
              <div className="review-section-head">
                <h2 id="sec-challenges">Challenges</h2>
                <span className="hint">
                  {entries.length} type{entries.length === 1 ? "" : "s"}{" "}
                  applicable to this snapshot
                </span>
              </div>
              <ul className="file-list" aria-label="Challenges">
                {entries.map((entry) => (
                  <li
                    className="file-card"
                    key={`${entry.type}-${entry.challengeId ?? "new"}`}
                  >
                    <div className="file-card-head">
                      <span className="file-path">{entry.typeLabel}</span>
                      {entry.latestOutcome ? (
                        <Badge tone="ok">
                          {entry.latestOutcome.score} · {entry.latestOutcome.scoreBand}
                        </Badge>
                      ) : (
                        <Badge>Not attempted</Badge>
                      )}
                    </div>
                    {entry.taskSummary ? (
                      <p className="file-explanation">{entry.taskSummary}</p>
                    ) : (
                      <p className="file-explanation">
                        Generate the first challenge of this type.
                      </p>
                    )}
                    {entry.targetFiles.length > 0 ? (
                      <div className="file-counts">
                        {entry.targetFiles.map((p) => (
                          <code
                            className="code-chip"
                            key={p}
                            style={{ marginRight: 6 }}
                          >
                            {p}
                          </code>
                        ))}
                      </div>
                    ) : null}
                    <div
                      className="status-actions"
                      style={{ marginTop: 12, gap: 8 }}
                    >
                      {entry.challengeId !== null ? (
                        <Link
                          className="btn btn-primary"
                          href={`/repos/${identity.owner}/${identity.repo}/challenges/${entry.challengeId}`}
                        >
                          Open this challenge <IconArrowRight size={14} />
                        </Link>
                      ) : (
                        <ChallengeListGenerateButton
                          owner={identity.owner}
                          repo={identity.repo}
                          type={entry.type}
                        />
                      )}
                      {entry.generatedAt ? (
                        <span className="hint" style={{ marginLeft: 8 }}>
                          generated {relTime(entry.generatedAt)}
                        </span>
                      ) : (
                        <span className="hint" style={{ marginLeft: 8 }}>
                          not yet generated
                        </span>
                      )}
                      {entry.latestOutcome ? (
                        <span className="hint" style={{ marginLeft: 8 }}>
                          last attempt {relTime(entry.latestOutcome.attemptedAt)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="check-intro" style={{ marginTop: 14 }}>
                Each challenge is generated on first open, then cached per
                repository snapshot.
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}

/** The shared header block — back link, eyebrow, repo title, branch badge. */
function ChallengeListHeader({
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
      <Link className="back-link" href="/import">
        <IconArrowLeft size={14} /> Back to imported repositories
      </Link>
      <div className="page-eyebrow" style={{ marginTop: 24 }}>
        <span className="dot" /> Challenges · M9
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
        <AiLabel>AI-generated challenges, grounded in your project map</AiLabel>
      </div>
      <p className="page-subtitle" style={{ marginTop: 16 }}>
        Project-tied debug and extension challenges generated from your project
        map. Pick one to open the answer-and-grade loop.
      </p>
    </header>
  )
}
