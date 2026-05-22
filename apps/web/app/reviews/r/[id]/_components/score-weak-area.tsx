// The Score / Weak Area UI — one of the four M8 UI pieces (spec:
// docs/design/score-weak-area.md), embedded as the "Your result" section of
// the Diff Review page (§6g).
//
// A Server Component — it renders an already-stored grading result, read-only.
// It is rendered only when the review has been graded. It renders the schema's
// `WeakArea` shape (area + detail — the merged code is authoritative; the
// spec's richer questionGrades / suggestion fields are not persisted).

import type { WeakAreaView } from "@/lib/diff-review"

import { AiLabel, IconCheck, IconGauge } from "../../../_components/chrome"

/** A short, calm band label for a 0–100 score. */
function scoreLabel(score: number): string {
  if (score >= 80) return "Solid grasp"
  if (score >= 55) return "Getting there"
  if (score >= 30) return "Needs review"
  return "Worth re-studying"
}

/**
 * The Score / Weak Area UI.
 *
 * @param score - the grading score, 0–100.
 * @param weakAreas - the weak areas grading surfaced; may be empty.
 * @param gradedAt - ISO timestamp the answers were graded.
 */
export function ScoreWeakArea({
  score,
  weakAreas,
  gradedAt,
}: {
  score: number
  weakAreas: WeakAreaView[]
  gradedAt: string
}) {
  const label = scoreLabel(score)

  return (
    <section className="review-section" aria-labelledby="sec-result">
      <div className="review-section-head">
        <h2 id="sec-result">Your result</h2>
        <AiLabel>AI-generated coaching feedback</AiLabel>
      </div>

      <div className="score-card">
        <div className="score-summary">
          <div
            className="score-dial"
            style={{ ["--score" as string]: String(score) }}
            role="img"
            aria-label={`Score: ${score} out of 100`}
          >
            <div className="score-dial-inner">
              <div className="score-value">
                {score}
                <span>/100</span>
              </div>
            </div>
          </div>
          <div className="score-text">
            <div className="score-label">{label}</div>
            <div className="score-sub">
              graded {new Date(gradedAt).toLocaleString()}
            </div>
            <p
              className="check-intro"
              style={{ marginTop: 8, maxWidth: "46ch" }}
            >
              This score shows where to focus before an interview — it is a
              guide, not a verdict.
            </p>
          </div>
        </div>

        <h3 className="weak-head">Areas to focus on</h3>
        {weakAreas.length > 0 ? (
          <ul className="weak-list">
            {weakAreas.map((w, i) => (
              <li className="weak-block" key={`${w.area}-${i}`}>
                <h4>{w.area}</h4>
                <p>{w.detail}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="weak-empty">
            <h4>
              <span className="ok-icon" aria-hidden="true">
                <IconCheck size={15} />
              </span>
              No specific weak areas — nice work
            </h4>
            <p>
              Your answers covered the change well. Re-read the questions and
              your answers above for any small refinements.
            </p>
          </div>
        )}

        <p
          className="check-intro"
          style={{ marginTop: 18, display: "flex", gap: 8, alignItems: "center" }}
        >
          <IconGauge size={14} />
          Want to push the score higher? Re-study the weak areas, then review
          another pull request.
        </p>
      </div>
    </section>
  )
}
