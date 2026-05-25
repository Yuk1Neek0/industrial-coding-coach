// The Completion Review UI — one of the four M9 UI pieces (spec:
// docs/design/completion-review-ui.md), embedded inline on the Challenge
// Detail Page per #145's hosting decision. Visual shape mirrors M8's
// Score / Weak Area UI (R4 normative — same labels, grouping, tone, score
// dial pattern as `apps/web/app/reviews/r/[id]/_components/score-weak-area.tsx`).
//
// A Server Component — it renders an already-stored, integrity-checked
// grading result. The component is only rendered when the parent Detail
// Page has at least one attempt with a non-null `grading` (per #147's
// Page Spec §4 — never rendered before grading exists). Renders only
// integrity-checked output: the integrity check (#141) rejects any grading
// with file references outside the M6 project map before it is persisted,
// so by the time this component renders the references resolve.
//
// FR-7 normative: the page is explicit, in real text, that the score is
// over the user's explanation only and does NOT claim "this passes".

import type {
  ChallengeAcceptanceCriterion,
  ChallengeGradingResult,
} from "@/lib/challenges"
import { scoreBand } from "@/lib/challenges"

import { AiLabel, IconCheck, IconGauge } from "../../_components/chrome"

/** Render a single graded result inline on the Detail Page. */
export function CompletionReview({
  grading,
  submittedAt,
  acceptanceCriteria,
  isPrior,
}: {
  grading: ChallengeGradingResult
  submittedAt: string
  acceptanceCriteria: ChallengeAcceptanceCriterion[]
  /** True when this is rendered inside an expanded prior-attempt panel. */
  isPrior: boolean
}) {
  const band = scoreBand(grading.score)
  const criteriaById = new Map(
    acceptanceCriteria.map((c) => [c.id, c.detail]),
  )
  const metCount = grading.criterionResults.filter((r) => r.passed).length
  const totalCount = acceptanceCriteria.length

  return (
    <section
      className="review-section"
      aria-labelledby={isPrior ? undefined : "sec-result"}
    >
      {!isPrior ? (
        <div className="review-section-head">
          <h2 id="sec-result">Your most recent attempt</h2>
          <AiLabel>AI-generated coaching feedback</AiLabel>
        </div>
      ) : null}

      <div className="score-card">
        <div className="score-summary">
          <div
            className="score-dial"
            style={{ ["--score" as string]: String(grading.score) }}
            role="img"
            aria-label={`Score: ${grading.score} out of 100`}
          >
            <div className="score-dial-inner">
              <div className="score-value">
                {grading.score}
                <span>/100</span>
              </div>
            </div>
          </div>
          <div className="score-text">
            <div className="score-label">{band}</div>
            <div className="score-sub">
              {isPrior ? "submitted" : "graded"}{" "}
              {new Date(submittedAt).toLocaleString()}
            </div>
            <p
              className="check-intro"
              style={{ marginTop: 8, maxWidth: "46ch" }}
            >
              This score shows where to focus before an interview. It is a
              guide, not a verdict — your code was not executed, built,
              linted, or tested. <strong>This page does not claim &quot;this passes&quot;.</strong>
            </p>
            {totalCount > 0 ? (
              <p className="hint" style={{ marginTop: 4 }}>
                {metCount} of {totalCount} acceptance criteria met.
              </p>
            ) : null}
          </div>
        </div>

        {/* Per-criterion results — FR-5. */}
        {grading.criterionResults.length > 0 ? (
          <>
            <h3 className="weak-head">Per criterion</h3>
            <ul className="weak-list">
              {grading.criterionResults.map((c) => {
                const prompt = criteriaById.get(c.criterionId) ?? c.criterionId
                return (
                  <li className="weak-block" key={c.criterionId}>
                    <h4>
                      {c.passed ? (
                        <span style={{ marginRight: 6 }}>
                          <IconCheck size={14} /> Met
                        </span>
                      ) : (
                        <span style={{ marginRight: 6 }}>Not met</span>
                      )}
                      {c.criterionId}
                    </h4>
                    <p>
                      <em>{prompt}</em>
                    </p>
                    <p>{c.detail}</p>
                  </li>
                )
              })}
            </ul>
          </>
        ) : null}

        {/* Weak areas — the actionable payoff (R4, M8 shape). */}
        <h3 className="weak-head">Areas to focus on</h3>
        {grading.weakAreas.length > 0 ? (
          <ul className="weak-list">
            {grading.weakAreas.map((w, i) => (
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
              Your explanation covered the challenge well. Re-read the
              per-criterion feedback above for any small refinements.
            </p>
          </div>
        )}

        {/* Short feedback paragraph — FR-5. */}
        {grading.feedback ? (
          <>
            <h3 className="weak-head">Feedback</h3>
            <p className="prose">{grading.feedback}</p>
          </>
        ) : null}

        <p
          className="check-intro"
          style={{
            marginTop: 18,
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <IconGauge size={14} />
          Want to push the score higher? Re-study the weak areas, then submit
          another attempt in the walkthrough above.
        </p>
      </div>
    </section>
  )
}
