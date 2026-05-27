import Link from "next/link"
import { notFound } from "next/navigation"

import { getChallengeDetailView } from "@/lib/challenges"

import {
  AiLabel,
  AppNav,
  Badge,
  IconArrowLeft,
  IconExternal,
  relTime,
} from "../_components/chrome"
import { CompletionReview } from "./_components/completion-review"
import { DebugWalkthrough } from "./_components/debug-walkthrough"
import { NewChallengeButton } from "./_components/new-challenge-button"
import { PriorAttemptsPanel } from "./_components/prior-attempts-panel"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface DetailParams {
  params: Promise<{ owner: string; repo: string; challengeId: string }>
}

export async function generateMetadata({ params }: DetailParams) {
  const { owner, repo, challengeId } = await params
  return {
    title: `Challenge ${challengeId} — ${owner}/${repo}`,
    description: `One project-tied debug/expansion challenge for ${owner}/${repo}.`,
  }
}

/**
 * `/repos/[owner]/[repo]/challenges/[challengeId]` — the Challenge Detail
 * Page (Page Spec §4 / §6, task #148). A Server Component shell that reads
 * one challenge + its full attempt history from the M9 data-access layer
 * and composes the four M9 UI pieces:
 *
 *   - Challenge metadata (type / description / in/out-of-scope / acceptance
 *     criteria / project-map sources)
 *   - "New challenge" action (R2 / FR-1)
 *   - Debug Walkthrough UI (#146) inline — the answer-entry form
 *   - Completion Review UI (#147) inline — most-recent attempt as primary
 *   - Inline collapsible prior-attempts panel (R5 / FR-10)
 *
 * Per #145's Page Spec §4a, both the Walkthrough and the Review live inline
 * here — there are no `/walkthrough` or `/review` sub-routes. This is the
 * single source of truth for the answer-and-score loop.
 */
export default async function ChallengeDetailPage({ params }: DetailParams) {
  const { owner, repo, challengeId } = await params
  const numericId = Number(challengeId)
  if (!Number.isInteger(numericId) || numericId <= 0) {
    notFound()
  }

  const detail = await getChallengeDetailView(numericId)
  if (!detail) {
    notFound()
  }

  // Belt-and-braces: route param identity must match the persisted snapshot
  // identity. A mismatch is treated as not-found so a stale URL never leaks
  // a challenge into the wrong owner/repo view.
  if (
    detail.identity.owner !== owner ||
    detail.identity.repo !== repo
  ) {
    notFound()
  }

  const mostRecent = detail.attempts[0] ?? null
  const priorAttempts = detail.attempts.slice(1)

  return (
    <div className="screen">
      <AppNav active="challenges" />
      <main className="page">
        <div className="container-narrow">
          {/* ── Header ─────────────────────────────────────────────── */}
          <header className="review-header">
            <Link
              className="back-link"
              href={`/repos/${detail.identity.owner}/${detail.identity.repo}/challenges`}
            >
              <IconArrowLeft size={14} /> Back to challenges
            </Link>
            <div className="page-eyebrow" style={{ marginTop: 24 }}>
              <span className="dot" /> Challenge · M9
            </div>
            <div className="review-titlewrap">
              <h1 className="page-title" style={{ margin: 0 }}>
                {detail.typeLabel}
              </h1>
              <Badge soft mono>
                {detail.identity.branch}
              </Badge>
              <AiLabel>AI-generated challenge</AiLabel>
            </div>
            <div className="review-meta">
              <span>
                {detail.identity.owner}/{detail.identity.repo}
              </span>
              <span className="sep" aria-hidden="true">
                ·
              </span>
              <a
                href={`https://github.com/${detail.identity.owner}/${detail.identity.repo}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View repository on GitHub <IconExternal size={12} />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <span className="sep" aria-hidden="true">
                ·
              </span>
              <span>generated {relTime(detail.generatedAt)}</span>
            </div>
          </header>

          {/* ── Honest framing line (FR-7 / R3) ────────────────────── */}
          <p className="check-intro" style={{ marginTop: 18 }}>
            This challenge was generated from your project map. The grader
            judges your <strong>explanation</strong> — your snippet, if you
            add one, is illustrative and is not scored.
          </p>

          {/* ── "New challenge" action (R2 / FR-1) ─────────────────── */}
          <div style={{ marginTop: 18 }}>
            <NewChallengeButton
              owner={detail.identity.owner}
              repo={detail.identity.repo}
              type={detail.type}
              hasAttempts={detail.attempts.length > 0}
            />
          </div>

          {/* ── Task description (§6b) ─────────────────────────────── */}
          <section className="review-section" aria-labelledby="sec-task">
            <div className="review-section-head">
              <h2 id="sec-task">What you&apos;re being asked to do</h2>
            </div>
            <p className="prose">{detail.taskDescription}</p>
          </section>

          {/* ── Scope (§6d) ────────────────────────────────────────── */}
          <section className="review-section" aria-labelledby="sec-scope">
            <div className="review-section-head">
              <h2 id="sec-scope">Scope</h2>
              <span className="hint">paths come from your project map</span>
            </div>
            <div className="scope-grid">
              <section aria-labelledby="sec-in-scope">
                <h3 id="sec-in-scope">In scope</h3>
                {detail.inScope.length > 0 ? (
                  <ul>
                    {detail.inScope.map((e) => (
                      <li key={e.path}>
                        <code className="code-chip">{e.path}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="inline-note">
                    No in-scope files were flagged for this challenge.
                  </p>
                )}
              </section>
              <section aria-labelledby="sec-out-of-scope">
                <h3 id="sec-out-of-scope">Out of scope</h3>
                {detail.outOfScope.length > 0 ? (
                  <ul>
                    {detail.outOfScope.map((e) => (
                      <li key={e.path}>
                        <code className="code-chip">{e.path}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="inline-note">
                    No explicit out-of-scope files for this challenge.
                  </p>
                )}
              </section>
            </div>
          </section>

          {/* ── Acceptance criteria (§6e) ──────────────────────────── */}
          <section
            className="review-section"
            aria-labelledby="sec-criteria"
          >
            <div className="review-section-head">
              <h2 id="sec-criteria">What &quot;done&quot; looks like</h2>
              <span className="hint">
                the grader checks your explanation against these
              </span>
            </div>
            {detail.acceptanceCriteria.length > 0 ? (
              <ol className="test-list">
                {detail.acceptanceCriteria.map((c) => (
                  <li className="test-row" key={c.id}>
                    <h3>{c.id}</h3>
                    <p className="test-rationale">{c.detail}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="inline-note">
                This challenge has no acceptance criteria.
              </p>
            )}
          </section>

          {/* ── Project-map sources (§6f) ──────────────────────────── */}
          {detail.sourceReferences.length > 0 ? (
            <section className="review-section" aria-labelledby="sec-source">
              <div className="review-section-head">
                <h2 id="sec-source">Where this came from</h2>
                <span className="hint">project-map citations</span>
              </div>
              <ul className="file-list">
                {detail.sourceReferences.map((s, i) => (
                  <li className="file-card" key={`${s.section}-${s.path}-${i}`}>
                    <div className="file-card-head">
                      <Badge>{s.section}</Badge>
                      <code className="file-path">{s.path}</code>
                    </div>
                    <p className="file-explanation">{s.note}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ── Debug Walkthrough UI (#146) — inline (§6g) ─────────── */}
          <DebugWalkthrough
            challengeId={detail.challengeId}
            owner={detail.identity.owner}
            repo={detail.identity.repo}
            inScope={detail.inScope.map((e) => e.path)}
            outOfScope={detail.outOfScope.map((e) => e.path)}
            acceptanceCriteria={detail.acceptanceCriteria}
            mapPaths={detail.m6Paths}
            priorAttempt={mostRecent}
          />

          {/* ── Completion Review UI (#147) — inline (§6h) ─────────── */}
          {mostRecent && mostRecent.grading ? (
            <CompletionReview
              grading={mostRecent.grading}
              submittedAt={mostRecent.submittedAt}
              acceptanceCriteria={detail.acceptanceCriteria}
              isPrior={false}
            />
          ) : null}

          {/* ── Inline collapsible prior-attempts panel (R5 / FR-10) ── */}
          {priorAttempts.length > 0 ? (
            <PriorAttemptsPanel
              attempts={priorAttempts}
              acceptanceCriteria={detail.acceptanceCriteria}
            />
          ) : null}

          {/* ── Honest reminder (§6i, FR-7) ────────────────────────── */}
          <p className="check-intro" style={{ marginTop: 24 }}>
            M9 grades your explanation against your project map. It does not
            run, build, or test your code.
          </p>

          <footer className="review-footer">
            <span className="val">
              {detail.identity.owner}/{detail.identity.repo}
            </span>
            <span className="sep">·</span>
            milestone 9 · debug and expansion challenge
          </footer>
        </div>
      </main>
    </div>
  )
}
