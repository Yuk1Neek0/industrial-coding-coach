"use client"

// The Understanding Check UI — one of the four M8 UI pieces (spec:
// docs/design/understanding-check.md), embedded as the "Check your
// understanding" section of the Diff Review page (§6f).
//
// The Client Component island of the answer-and-score loop: it displays the
// comprehension questions, collects free-text answers, and submits them
// through the `gradeReviewAction` Server Action. On success it transitions
// into the graded read-only view and renders the Score / Weak Area UI below.
// It never touches the Anthropic SDK itself. All questions are free-text — the
// merged `ComprehensionQuestion` schema has no `kind`/`choices` fields.

import { useState } from "react"

import type {
  ComprehensionAnswer,
  ComprehensionQuestion,
  DiffReviewView,
} from "@/lib/diff-review"

import { AiLabel, IconAlert, IconCheck, IconLoader } from "../../../_components/chrome"
import { gradeReviewAction } from "../actions"
import { ScoreWeakArea } from "./score-weak-area"

type Phase = "answering" | "grading" | "graded" | "error"

/**
 * The Understanding Check UI plus the graded result it transitions into.
 *
 * @param reviewId - the `diff_reviews` row id, the grading action's key.
 * @param questions - the FIXED comprehension-question set from the review.
 * @param initialAnswers - the user's stored answers, or `null` on a fresh
 *   review (the form starts blank and active).
 * @param initialScore - the stored grading score, or `null` until graded.
 * @param initialWeakAreas - the stored weak areas, or `null` until graded.
 * @param updatedAt - ISO timestamp of the review's last update (the grade time
 *   once graded).
 */
export function UnderstandingCheck({
  reviewId,
  questions,
  initialAnswers,
  initialScore,
  initialWeakAreas,
  updatedAt,
}: {
  reviewId: number
  questions: ComprehensionQuestion[]
  initialAnswers: ComprehensionAnswer[] | null
  initialScore: number | null
  initialWeakAreas: DiffReviewView["weakAreas"]
  updatedAt: string
}) {
  // A graded review (score present) lands directly in the graded view.
  const alreadyGraded = initialScore !== null
  const [phase, setPhase] = useState<Phase>(
    alreadyGraded ? "graded" : "answering",
  )

  // Answer state, keyed by question id. Seeded from any stored answers.
  const seedAnswers = (): Record<string, string> => {
    const map: Record<string, string> = {}
    for (const q of questions) map[q.id] = ""
    for (const a of initialAnswers ?? []) {
      if (a.questionId in map) map[a.questionId] = a.answer
    }
    return map
  }
  const [answers, setAnswers] = useState<Record<string, string>>(seedAnswers)

  // The graded result — seeded from props, replaced by a fresh grading.
  const [result, setResult] = useState<{
    score: number
    weakAreas: NonNullable<DiffReviewView["weakAreas"]>
    gradedAt: string
  } | null>(
    alreadyGraded
      ? {
          score: initialScore ?? 0,
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
    const payload: ComprehensionAnswer[] = questions.map((q) => ({
      questionId: q.id,
      answer: answers[q.id] ?? "",
    }))
    const res = await gradeReviewAction({ reviewId, answers: payload })
    if (res.ok) {
      setResult({
        score: res.review.score ?? 0,
        weakAreas: res.review.weakAreas ?? [],
        gradedAt: res.review.updatedAt,
      })
      setPhase("graded")
    } else {
      setErrorMessage(res.error.message)
      setPhase("error")
    }
  }

  // Defensive: a review with no questions (FR-3 says this should not happen).
  if (questions.length === 0) {
    return (
      <section className="review-section" aria-labelledby="sec-check">
        <div className="review-section-head">
          <h2 id="sec-check">Check your understanding</h2>
        </div>
        <p className="inline-note">
          <IconAlert size={15} />
          No comprehension questions were generated for this review.
        </p>
      </section>
    )
  }

  return (
    <>
      <section className="review-section" aria-labelledby="sec-check">
        <div className="review-section-head">
          <h2 id="sec-check">Check your understanding</h2>
          <AiLabel>AI-generated questions</AiLabel>
        </div>

        <div className="check-panel">
          <p className="check-intro">
            Answer in your own words — these questions are about the change you
            just reviewed. Your answers are graded into a score and a list of
            areas to focus on. The grading is automated coaching feedback.
          </p>

          {!readOnly && (
            <p className="check-progress">
              Answered {answeredCount} of {questions.length}
            </p>
          )}

          <ol className="question-list">
            {questions.map((q, i) => {
              const inputId = `answer-${q.id}`
              return (
                <li className="question-block" key={q.id}>
                  <label className="question-prompt" htmlFor={inputId}>
                    <span className="question-num" aria-hidden="true">
                      Q{i + 1}
                    </span>
                    <span>{q.prompt}</span>
                  </label>
                  {readOnly ? (
                    <>
                      <div className="answer-readonly-label">Your answer</div>
                      <div
                        className={`answer-readonly${
                          (answers[q.id] ?? "").trim() === "" ? " empty" : ""
                        }`}
                      >
                        {(answers[q.id] ?? "").trim() === ""
                          ? "(left blank)"
                          : answers[q.id]}
                      </div>
                    </>
                  ) : (
                    <textarea
                      id={inputId}
                      className="answer-input"
                      placeholder="Explain in your own words…"
                      value={answers[q.id] ?? ""}
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
            <div className="check-error" role="alert" aria-live="assertive">
              <h3>
                <IconAlert size={15} /> Couldn&apos;t grade your answers yet
              </h3>
              <p>
                This can happen if the AI grading service is unavailable. Your
                answers are kept — try again.
                {errorMessage ? ` (${errorMessage})` : ""}
              </p>
              <div className="status-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void submit()}
                >
                  <IconCheck size={14} /> Try again
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {readOnly && result && (
        <ScoreWeakArea
          score={result.score}
          weakAreas={result.weakAreas}
          gradedAt={result.gradedAt}
        />
      )}
    </>
  )
}
