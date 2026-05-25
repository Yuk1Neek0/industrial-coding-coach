"use client"

// The Understanding Questions UI — one of the four M7 UI pieces (spec:
// docs/design/understanding-questions.page-spec.md), embedded as the
// "Check your understanding" section of the Issue Learning Workspace page
// (§6f). On submit it posts answers through the `gradeLearningUnitAction`
// Server Action and transitions into the graded read-only view + the
// Score / Weak Area block.
//
// Same answer-and-score loop shape as M8's Understanding Check
// (`apps/web/app/reviews/r/[id]/_components/understanding-check.tsx`) — R6
// (strictly per-unit scoring), NFR Fair grading. The Anthropic SDK is never
// reached from this Client Component; it is reached only by the Server Action
// it calls.

import { useState } from "react"

import type { LearningUnitView } from "@/lib/learning-units"
import type {
  LearningWeakArea,
  UnderstandingAnswer,
  UnderstandingScore,
} from "@workspace/db/learning-units"

import {
  AiLabel,
  IconAlert,
  IconCheck,
  IconGauge,
  IconLoader,
} from "../../../../../_components/chrome"
import { gradeLearningUnitAction } from "../actions"

type Phase = "answering" | "grading" | "graded" | "error"

interface UnderstandingQuestionsProps {
  unitId: number
  questions: LearningUnitView["questions"]
  initialAnswers: UnderstandingAnswer[] | null
  initialScore: UnderstandingScore | null
  initialWeakAreas: LearningWeakArea[] | null
  updatedAt: string
}

/** A short, calm band label for a 0–100 score (mirrors M8 score-weak-area). */
function scoreLabel(score: number): string {
  if (score >= 80) return "Solid grasp"
  if (score >= 55) return "Getting there"
  if (score >= 30) return "Needs review"
  return "Worth re-studying"
}

export function UnderstandingQuestions({
  unitId,
  questions,
  initialAnswers,
  initialScore,
  initialWeakAreas,
  updatedAt,
}: UnderstandingQuestionsProps) {
  const alreadyGraded = initialScore !== null
  const [phase, setPhase] = useState<Phase>(
    alreadyGraded ? "graded" : "answering",
  )

  const seedAnswers = (): Record<string, string> => {
    const map: Record<string, string> = {}
    for (const q of questions) map[q.id] = ""
    for (const a of initialAnswers ?? []) {
      if (a.questionId in map) map[a.questionId] = a.answer
    }
    return map
  }
  const [answers, setAnswers] = useState<Record<string, string>>(seedAnswers)

  const [result, setResult] = useState<{
    score: UnderstandingScore
    weakAreas: LearningWeakArea[]
    gradedAt: string
  } | null>(
    alreadyGraded
      ? {
          score: initialScore ?? { overall: 0, perQuestion: [] },
          weakAreas: initialWeakAreas ?? [],
          gradedAt: updatedAt,
        }
      : null,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const busy = phase === "grading"
  const readOnly = phase === "graded"
  const answeredCount = questions.filter(
    (q) => (answers[q.id] ?? "").trim() !== "",
  ).length
  const blankCount = questions.length - answeredCount

  async function submit() {
    if (busy) return
    setPhase("grading")
    setErrorMessage(null)
    const payload: UnderstandingAnswer[] = questions.map((q) => ({
      questionId: q.id,
      answer: answers[q.id] ?? "",
    }))
    const res = await gradeLearningUnitAction({ unitId, answers: payload })
    if (res.ok) {
      setResult({
        score: res.unit.score ?? { overall: 0, perQuestion: [] },
        weakAreas: res.unit.weakAreas ?? [],
        gradedAt: res.unit.updatedAt,
      })
      setPhase("graded")
    } else {
      setErrorMessage(res.error.message)
      setPhase("error")
    }
  }

  if (questions.length === 0) {
    return (
      <section className="unit-section" aria-labelledby="sec-check">
        <div className="unit-section-head">
          <h2 id="sec-check">Check your understanding</h2>
        </div>
        <p className="inline-note">
          <IconAlert size={15} />
          No understanding questions were generated for this learning unit.
        </p>
      </section>
    )
  }

  return (
    <>
      <section className="unit-section" aria-labelledby="sec-check">
        <div className="unit-section-head">
          <h2 id="sec-check">Check your understanding</h2>
          <AiLabel>AI-generated questions</AiLabel>
        </div>
        <p className="unit-prose" style={{ fontSize: 14 }}>
          Answer in your own words — these questions are about{" "}
          <em>this</em> issue in your repo. Your answers are graded into a
          score and a list of areas to focus on. The grading is automated
          coaching feedback.
        </p>
        {!readOnly && (
          <p className="check-progress">
            Answered {answeredCount} of {questions.length}
          </p>
        )}
        <ol
          className="unit-question-list"
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          {questions.map((q, i) => {
            const inputId = `answer-${q.id}`
            const answer = answers[q.id] ?? ""
            return (
              <li className="unit-question" key={q.id}>
                <label className="question-prompt" htmlFor={inputId}>
                  <span style={{ color: "var(--fg-subtle)", marginRight: 8 }}>
                    Q{i + 1}
                  </span>
                  {q.prompt}
                </label>
                {readOnly ? (
                  <>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--fg-subtle)",
                        marginBottom: 4,
                      }}
                    >
                      Your answer
                    </div>
                    <div
                      className={`answer-readonly${answer.trim() === "" ? " empty" : ""}`}
                    >
                      {answer.trim() === "" ? "(left blank)" : answer}
                    </div>
                  </>
                ) : (
                  <textarea
                    id={inputId}
                    className="answer-input"
                    placeholder="Explain in your own words…"
                    value={answer}
                    disabled={busy}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.id]: e.target.value,
                      }))
                    }
                  />
                )}
              </li>
            )
          })}
        </ol>
        {!readOnly && (
          <div className="check-submit" aria-busy={busy}>
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => void submit()}
              disabled={busy}
            >
              {busy ? (
                <>
                  <IconLoader size={14} /> Grading your answers…
                </>
              ) : (
                <>
                  <IconCheck size={14} /> Submit answers
                </>
              )}
            </button>
            <span className="check-submit-hint">
              {busy
                ? "Reviewing your answers and scoring them — a few seconds."
                : blankCount > 0
                  ? `${blankCount} question${blankCount === 1 ? "" : "s"} still blank — you can still submit.`
                  : "Grading takes a few seconds while your answers are reviewed."}
            </span>
          </div>
        )}
        {phase === "error" && (
          <div
            className="inline-note inline-warn"
            role="alert"
            aria-live="assertive"
            style={{ marginTop: 12 }}
          >
            <IconAlert size={15} />
            <span>
              Couldn&apos;t grade your answers yet. Your answers are kept — try
              again.{errorMessage ? ` (${errorMessage})` : ""}{" "}
              <button
                type="button"
                className="btn btn-ghost"
                style={{ height: 28, padding: "0 10px", marginLeft: 8 }}
                onClick={() => void submit()}
              >
                Try again
              </button>
            </span>
          </div>
        )}
      </section>

      {readOnly && result && (
        <section className="unit-section" aria-labelledby="sec-result">
          <div className="unit-section-head">
            <h2 id="sec-result">Your result</h2>
            <AiLabel>AI-generated coaching feedback</AiLabel>
          </div>
          <div className="score-card">
            <div className="score-summary">
              <div
                className="score-value"
                role="img"
                aria-label={`Score: ${result.score.overall} out of 100`}
              >
                {result.score.overall}
                <span>/100</span>
              </div>
              <div>
                <div className="score-label">
                  {scoreLabel(result.score.overall)}
                </div>
                <div className="score-sub">
                  graded {new Date(result.gradedAt).toLocaleString()}
                </div>
                <p
                  className="unit-prose"
                  style={{ marginTop: 8, fontSize: 13.5, maxWidth: "46ch" }}
                >
                  This score shows where to focus before an interview — it is
                  a guide, not a verdict.
                </p>
              </div>
            </div>

            <h3 style={{ fontSize: 14, marginTop: 22 }}>Areas to focus on</h3>
            {result.weakAreas.length > 0 ? (
              <ul className="weak-list">
                {result.weakAreas.map((w, i) => (
                  <li className="weak-block" key={`${w.area}-${i}`}>
                    <h4>{w.area}</h4>
                    <p>{w.detail}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="weak-empty">
                <strong>
                  <IconCheck size={14} /> No specific weak areas — nice work.
                </strong>
                <p style={{ marginTop: 6 }}>
                  Your answers covered the unit well. Re-read the questions
                  above for any small refinements.
                </p>
              </div>
            )}
            <p
              className="unit-prose"
              style={{
                marginTop: 18,
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: 13,
                color: "var(--fg-muted)",
              }}
            >
              <IconGauge size={14} />
              Want to push the score higher? Re-study the weak areas, then
              answer the questions again from a fresh tab.
            </p>
          </div>
        </section>
      )}
    </>
  )
}
