import Link from "next/link"
import { notFound } from "next/navigation"

import { getDiffReviewView } from "@/lib/diff-review"

import {
  AiLabel,
  AppNav,
  Badge,
  IconAlert,
  IconArrowLeft,
  IconBeaker,
  IconExternal,
  IconFileCode,
} from "../../_components/chrome"
import { fileAnchorId, relTime } from "../../_components/util"
import { RiskAnalysisPanel } from "./_components/risk-analysis-panel"
import { UnderstandingCheck } from "./_components/understanding-check"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface ReviewPageParams {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: ReviewPageParams) {
  const { id } = await params
  return {
    title: `Diff review #${id}`,
    description: "A plain-language review of a pull request, grounded in its actual diff.",
  }
}

/** Map a GitHub change status to a badge tone + readable label. */
function changeKindBadge(status: string): {
  tone: "added" | "modified" | "removed" | "renamed"
  label: string
} {
  switch (status) {
    case "added":
      return { tone: "added", label: "Added" }
    case "removed":
      return { tone: "removed", label: "Removed" }
    case "renamed":
      return { tone: "renamed", label: "Renamed" }
    case "copied":
      return { tone: "renamed", label: "Copied" }
    default:
      // modified / changed / unchanged / unknown all read as "Modified".
      return { tone: "modified", label: "Modified" }
  }
}

/** Render one parsed diff hunk as a readable, accessible patch block. */
function HunkBlock({
  hunk,
  filePath,
}: {
  hunk: { header: string; lines: { kind: string; text: string }[] }
  filePath: string
}) {
  return (
    <div>
      <div className="diff-hunk-header" aria-hidden="true">
        {hunk.header}
      </div>
      {hunk.lines.map((line, i) => {
        const cls =
          line.kind === "add" ? "add" : line.kind === "del" ? "del" : "context"
        const marker = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "
        const srLabel =
          line.kind === "add"
            ? "Added line: "
            : line.kind === "del"
              ? "Removed line: "
              : ""
        return (
          <div className={`diff-line ${cls}`} key={`${filePath}-${i}`}>
            <span className="marker" aria-hidden="true">
              {marker}
            </span>
            {srLabel && <span className="sr-only">{srLabel}</span>}
            {line.text}
          </div>
        )
      })}
    </div>
  )
}

/**
 * `/reviews/r/[id]` — the Diff Review page (Diff Review page spec §4, task #116).
 * A Server Component shell that reads one stored diff review from the M8
 * data-access layer and composes the four M8 UI pieces: the changed-file
 * explanations + diffs, the Risk Analysis Panel, the test suggestions, and the
 * Understanding Check (which transitions into the Score / Weak Area UI).
 */
export default async function DiffReviewPage({ params }: ReviewPageParams) {
  const { id } = await params
  const numericId = Number(id)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    notFound()
  }

  const loaded = await getDiffReviewView(numericId)
  if (!loaded) {
    notFound()
  }
  const { review, pullRequest } = loaded

  const prTitle = pullRequest?.title ?? `Pull request #${review.prNumber}`
  const prUrl =
    pullRequest?.url ??
    `https://github.com/${review.repo.owner}/${review.repo.name}/pull/${review.prNumber}`
  const linkedIssue = pullRequest?.linkedIssue ?? null

  return (
    <div className="screen">
      <AppNav active="reviews" />
      <main className="page">
        <div className="container-narrow">
          {/* ── Header ─────────────────────────────────────────────── */}
          <header className="review-header">
            <Link
              className="back-link"
              href={`/reviews/${review.repo.owner}/${review.repo.name}`}
            >
              <IconArrowLeft size={14} /> Back to reviews
            </Link>
            <div className="page-eyebrow" style={{ marginTop: 24 }}>
              <span className="dot" /> Diff Review · M8
            </div>
            <div className="review-titlewrap">
              <h1 className="page-title" style={{ margin: 0 }}>
                {prTitle}
              </h1>
            </div>
            <div className="review-meta">
              <span>
                {review.repo.owner}/{review.repo.name} · PR #{review.prNumber}
              </span>
              <span className="sep" aria-hidden="true">
                ·
              </span>
              <a href={prUrl} target="_blank" rel="noopener noreferrer">
                View on GitHub <IconExternal size={12} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <span className="sep" aria-hidden="true">
                ·
              </span>
              <span>reviewed {relTime(review.createdAt)}</span>
              {review.score !== null && (
                <>
                  <span className="sep" aria-hidden="true">
                    ·
                  </span>
                  <span>answered {relTime(review.updatedAt)}</span>
                </>
              )}
              <Badge soft mono>
                {review.branch}
              </Badge>
              <AiLabel />
            </div>
            <nav className="review-section-nav" aria-label="Sections">
              <a href="#sec-files">Files</a>
              <a href="#sec-core">Core logic</a>
              <a href="#sec-risks">Risks</a>
              <a href="#sec-tests">Tests</a>
              <a href="#sec-check">Understanding check</a>
            </nav>
          </header>

          {/* ── Integrity flag (FR-4) ──────────────────────────────── */}
          {!review.fileReferencesOk && (
            <p className="review-flag" role="status">
              <IconAlert size={14} />
              Some file references in this review could not be matched to the
              pull request&apos;s changed files — they are shown as plain text.
            </p>
          )}

          {/* ── Linked issue context (§6a) ─────────────────────────── */}
          {linkedIssue && (
            <section
              className="review-section"
              aria-labelledby="sec-issue"
              style={{ marginTop: 32 }}
            >
              <div className="linked-issue">
                <div className="linked-issue-head">
                  What this PR was supposed to do
                </div>
                <h3 id="sec-issue">
                  Issue #{linkedIssue.number}: {linkedIssue.title}
                </h3>
                {linkedIssue.acceptanceCriteria.length > 0 && (
                  <ul>
                    {linkedIssue.acceptanceCriteria.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {/* ── Changed files (§6b) ────────────────────────────────── */}
          <section className="review-section" aria-labelledby="sec-files">
            <div className="review-section-head">
              <h2 id="sec-files">Changed files</h2>
              <span className="hint">
                {review.changedFiles.length} file
                {review.changedFiles.length === 1 ? "" : "s"} explained against
                the real diff
              </span>
            </div>
            {review.changedFiles.length > 0 ? (
              <ul className="file-list">
                {review.changedFiles.map((file) => (
                  <li
                    className="file-card"
                    id={fileAnchorId(file.path)}
                    data-unresolved={!file.resolved}
                    key={file.path}
                  >
                    <div className="file-card-head">
                      <span className="repo-icon" aria-hidden="true">
                        <IconFileCode size={15} />
                      </span>
                      <span className="file-path">{file.path}</span>
                      {(() => {
                        const kind = changeKindBadge(file.changeKind)
                        return <Badge tone={kind.tone}>{kind.label}</Badge>
                      })()}
                      <span className="file-counts">
                        <span className="add">+{file.additions}</span>
                        <span className="del">−{file.deletions}</span>
                      </span>
                    </div>
                    <p className="file-explanation">{file.explanation}</p>
                    {file.resolved ? (
                      file.patchOmitted || file.hunks.length === 0 ? (
                        <p className="diff-omitted">
                          {file.patchOmitted
                            ? "No parseable diff is available for this file (binary, omitted, or too large)."
                            : "This file has no diff hunks."}
                        </p>
                      ) : (
                        <details className="file-diff">
                          <summary>
                            Show diff ({file.hunks.length} hunk
                            {file.hunks.length === 1 ? "" : "s"})
                          </summary>
                          <div
                            className="diff-block"
                            aria-label={`Diff for ${file.path}`}
                          >
                            {file.hunks.map((hunk, hi) => (
                              <HunkBlock
                                key={hi}
                                hunk={hunk}
                                filePath={file.path}
                              />
                            ))}
                          </div>
                        </details>
                      )
                    ) : (
                      <p className="diff-omitted">
                        This path could not be matched to a file the pull
                        request changed — its diff is not shown.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inline-note">
                <IconAlert size={15} />
                This review lists no changed-file explanations.
              </p>
            )}
          </section>

          {/* ── Core-logic explanation (§6c) ───────────────────────── */}
          <section className="review-section" aria-labelledby="sec-core">
            <div className="review-section-head">
              <h2 id="sec-core">What this change does</h2>
              <span className="hint">the change as a whole</span>
            </div>
            <p className="prose">{review.coreLogicExplanation}</p>
          </section>

          {/* ── Risk Analysis Panel (§6d) ──────────────────────────── */}
          <RiskAnalysisPanel risks={review.risks} />

          {/* ── Test suggestions (§6e) ─────────────────────────────── */}
          <section className="review-section" aria-labelledby="sec-tests">
            <div className="review-section-head">
              <h2 id="sec-tests">Suggested tests</h2>
              <span className="hint">tests that would cover this change</span>
            </div>
            {review.testSuggestions.length > 0 ? (
              <ul className="test-list">
                {review.testSuggestions.map((t, i) => (
                  <li className="test-row" key={i}>
                    <h3>
                      <span className="test-icon" aria-hidden="true">
                        <IconBeaker size={15} />
                      </span>
                      {t.description}
                    </h3>
                    <p className="test-rationale">{t.rationale}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inline-note">
                <IconBeaker size={15} />
                No specific test suggestions for this change.
              </p>
            )}
          </section>

          {/* ── Understanding Check + Score / Weak Area (§6f, §6g) ─── */}
          <UnderstandingCheck
            reviewId={review.id}
            questions={review.questions}
            initialAnswers={review.answers}
            initialScore={review.score}
            initialWeakAreas={review.weakAreas}
            updatedAt={review.updatedAt}
          />

          <footer className="review-footer">
            <span className="val">
              {review.repo.owner}/{review.repo.name} · PR #{review.prNumber}
            </span>
            <span className="sep">·</span>
            milestone 8 · diff review coach
          </footer>
        </div>
      </main>
    </div>
  )
}
