// The inline collapsible prior-attempts panel — R5 / FR-10 normative.
//
// Rendered below the most-recent Completion Review on the Challenge Detail
// Page when `attempts.length > 1`. Each prior-attempt entry is a native
// `<details>` element — collapsed by default, expand/collapse client-side
// with no JS, full keyboard support. The whole attempt history is loaded
// server-side; there is no lazy fetch on expand (per #145's Page Spec §6h).
//
// Prior attempts are NOT on a separate page — there is no `/attempts` sub-
// route. This panel is the M9 self-review affordance: the user can read
// what they wrote and how they scored on past attempts without leaving
// `/repos/[owner]/[repo]/challenges/[challengeId]`.

import type {
  ChallengeAcceptanceCriterion,
  ChallengeAttemptView,
} from "@/lib/challenges"
import { scoreBand } from "@/lib/challenges"

import { CompletionReview } from "./completion-review"

/**
 * Render the prior-attempts panel — one collapsed `<details>` per prior
 * attempt, in most-recent-first order. Each trigger row shows the
 * timestamp, the 0–100 score chip, and the score band; the expanded panel
 * shows the explanation, optional snippets (illustrative only — not re-
 * graded), filePaths, and the full per-criterion + weak-area breakdown via
 * the `CompletionReview` component (so the rendering is consistent).
 */
export function PriorAttemptsPanel({
  attempts,
  acceptanceCriteria,
}: {
  attempts: ChallengeAttemptView[]
  acceptanceCriteria: ChallengeAcceptanceCriterion[]
}) {
  return (
    <section className="review-section" aria-labelledby="sec-prior-attempts">
      <div className="review-section-head">
        <h2 id="sec-prior-attempts">Prior attempts</h2>
        <span className="hint">
          {attempts.length} earlier attempt
          {attempts.length === 1 ? "" : "s"} — newest first
        </span>
      </div>
      <ul className="file-list" aria-label="Prior attempts">
        {attempts.map((attempt) => {
          const grading = attempt.grading
          const submitted = new Date(attempt.submittedAt).toLocaleString()
          const score = grading?.score ?? null
          const band = score !== null ? scoreBand(score) : "Awaiting grade"
          return (
            <li className="file-card" key={attempt.id}>
              <details>
                <summary>
                  <span className="file-card-head">
                    <span className="file-path">Prior attempt</span>
                    <span className="hint">{submitted}</span>
                    {score !== null ? (
                      <span className="badge badge-soft">
                        {score} · {band}
                      </span>
                    ) : (
                      <span className="badge badge-soft">{band}</span>
                    )}
                  </span>
                </summary>
                <div style={{ marginTop: 12 }}>
                  <h3>Explanation</h3>
                  <p className="prose">
                    {attempt.explanation || "(left blank)"}
                  </p>

                  {attempt.filePaths.length > 0 ? (
                    <>
                      <h3>Files the user said they would change</h3>
                      <ul>
                        {attempt.filePaths.map((p) => (
                          <li key={p}>
                            <code className="code-chip">{p}</code>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {attempt.snippets.length > 0 ? (
                    <>
                      <h3>Snippets (illustrative — not graded)</h3>
                      <ul>
                        {attempt.snippets.map((s, i) => (
                          <li key={`${s.path}-${i}`}>
                            <div>
                              <code className="code-chip">{s.path}</code>
                            </div>
                            <pre
                              style={{
                                whiteSpace: "pre-wrap",
                                marginTop: 4,
                              }}
                            >
                              {s.code}
                            </pre>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {grading ? (
                    <CompletionReview
                      grading={grading}
                      submittedAt={attempt.submittedAt}
                      acceptanceCriteria={acceptanceCriteria}
                      isPrior={true}
                    />
                  ) : (
                    <p className="inline-note">
                      This attempt has not been graded yet.
                    </p>
                  )}
                </div>
              </details>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
