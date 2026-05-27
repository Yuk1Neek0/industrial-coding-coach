"use client"

// The Debug Walkthrough UI — one of the four M9 UI pieces (spec:
// docs/design/debug-walkthrough-ui.md), embedded inline on the Challenge
// Detail Page per #145's hosting decision.
//
// A Client Component island for the answer-entry side of the M9 answer-and-
// score loop: it shows the active challenge's scope, collects a free-text
// explanation plus optional per-file snippets (paths restricted to M6-map
// paths only — R8), and submits the attempt through `submitAttemptAction`.
// The Anthropic SDK is never reached here — the action server-side runs the
// bounded grading call (#143) via `lib/challenges.ts`.
//
// FR-7 / R3 — explanation-only framing: the "Only your explanation is graded;
// snippets are illustrative" note is plain text in two places (under the
// explanation field and at the top of the snippets section) so the user
// cannot miss it. Snippet path picker is restricted by construction — no
// free-typed paths.

import { useRouter } from "next/navigation"
import { useState } from "react"

import type {
  ChallengeAttemptSnippet,
  ChallengeAttemptView,
} from "@/lib/challenges"

import {
  AiLabel,
  IconAlert,
  IconCheck,
  IconLoader,
} from "../../_components/chrome"
import { submitAttemptAction } from "../actions"

type Phase = "answering" | "submitting" | "submitted" | "error"

/** What the parent Detail Page hands to this component. */
export interface DebugWalkthroughProps {
  challengeId: number
  owner: string
  repo: string
  inScope: string[]
  outOfScope: string[]
  acceptanceCriteria: { id: string; detail: string }[]
  /** Union of all M6 project-map paths the picker may offer (R8). */
  mapPaths: string[]
  /** The user's most-recent stored attempt, or `null` on a fresh challenge. */
  priorAttempt: ChallengeAttemptView | null
}

/**
 * The Debug Walkthrough UI — embedded as the "Your walkthrough" section of
 * the Challenge Detail Page. Pre-populates from the most-recent attempt
 * when one exists so the user can revise and re-submit (US-6); a new submit
 * creates a new attempt row and rotates the most-recent role to it.
 */
export function DebugWalkthrough({
  challengeId,
  owner,
  repo,
  inScope,
  outOfScope,
  acceptanceCriteria,
  mapPaths,
  priorAttempt,
}: DebugWalkthroughProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>("answering")
  const [explanation, setExplanation] = useState<string>(
    priorAttempt?.explanation ?? "",
  )
  const [filePaths, setFilePaths] = useState<string[]>(
    priorAttempt?.filePaths ?? [],
  )
  const [snippets, setSnippets] = useState<ChallengeAttemptSnippet[]>(
    priorAttempt?.snippets ?? [],
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [snippetsOpen, setSnippetsOpen] = useState<boolean>(
    (priorAttempt?.snippets.length ?? 0) > 0,
  )

  const inScopeSet = new Set(inScope)
  const outOfScopeSet = new Set(outOfScope)
  const busy = phase === "submitting"

  // R8 normative — the file-path / snippet pickers are restricted to M6
  // paths. The candidate list is the snapshot's M6-mapped set, surfaced as
  // a `<datalist>` plus a `<select>` for accessibility (combobox semantics
  // by HTML alone, no custom JS — Tab-friendly).
  const pickerCandidates = mapPaths

  function toggleFilePath(value: string) {
    if (!value) return
    setFilePaths((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value],
    )
  }

  function addSnippet() {
    if (pickerCandidates.length === 0) return
    setSnippets((prev) => [
      ...prev,
      { path: pickerCandidates[0] ?? "", code: "" },
    ])
    setSnippetsOpen(true)
  }

  function updateSnippet(
    index: number,
    next: Partial<ChallengeAttemptSnippet>,
  ) {
    setSnippets((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...next } : s)),
    )
  }

  function removeSnippet(index: number) {
    setSnippets((prev) => prev.filter((_, i) => i !== index))
  }

  async function submit() {
    if (busy) return
    setPhase("submitting")
    setErrorMessage(null)
    const result = await submitAttemptAction({
      challengeId,
      explanation,
      filePaths,
      snippets,
    })
    if (result.ok) {
      // The attempt is persisted + graded server-side. Ask Next.js to
      // re-fetch the route so the Completion Review UI and the prior-
      // attempts panel render against the fresh state. We keep the form
      // state intact so a quick "retry" doesn't require retyping; the
      // priorAttempt prop will pre-populate on the next render anyway.
      setPhase("submitted")
      router.refresh()
      return
    }
    setErrorMessage(result.error.message)
    setPhase("error")
  }

  return (
    <section className="review-section" aria-labelledby="sec-walkthrough">
      <div className="review-section-head">
        <h2 id="sec-walkthrough">Your walkthrough</h2>
        <AiLabel>AI-generated coaching feedback</AiLabel>
      </div>

      {/* Scope reference panel — visible while answering (§6.2, R8). */}
      <div className="check-panel" style={{ marginBottom: 18 }}>
        <p className="check-intro">
          Explain in your own words which files you would change and why.
          <strong> Only your explanation is graded</strong> — any snippets you
          attach are notes to yourself, not part of the score.
        </p>
        <details open>
          <summary>Reference: scope and acceptance criteria</summary>
          <div className="scope-grid" style={{ marginTop: 10 }}>
            <section>
              <h4>In scope</h4>
              {inScope.length > 0 ? (
                <ul>
                  {inScope.map((p) => (
                    <li key={p}>
                      <code className="code-chip">{p}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="inline-note">(none)</p>
              )}
            </section>
            <section>
              <h4>Out of scope</h4>
              {outOfScope.length > 0 ? (
                <ul>
                  {outOfScope.map((p) => (
                    <li key={p}>
                      <code className="code-chip">{p}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="inline-note">(none)</p>
              )}
            </section>
          </div>
          {acceptanceCriteria.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <h4>Done when…</h4>
              <ul>
                {acceptanceCriteria.map((c) => (
                  <li key={c.id}>
                    <strong>{c.id}.</strong> {c.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </details>
      </div>

      <div className="check-panel">
        {/* Explanation field — the primary input (FR-4 / R3). */}
        <div>
          <label
            className="question-prompt"
            htmlFor="walkthrough-explanation"
          >
            <span>Explain which files you would change and why</span>
          </label>
          <textarea
            id="walkthrough-explanation"
            className="answer-input"
            placeholder="Plain English — write the way you'd answer in an interview…"
            value={explanation}
            disabled={busy}
            onChange={(e) => setExplanation(e.target.value)}
            rows={8}
          />
          <p className="hint" style={{ marginTop: 4 }}>
            Plain English. <strong>Only this explanation is graded.</strong>
          </p>
        </div>

        {/* File-paths picker — restricted to M6 paths (R8 / FR-4). */}
        <div style={{ marginTop: 18 }}>
          <label className="question-prompt" htmlFor="walkthrough-filepath">
            <span>Files you would change</span>
          </label>
          {pickerCandidates.length > 0 ? (
            <>
              <select
                id="walkthrough-filepath"
                className="answer-input"
                disabled={busy}
                onChange={(e) => {
                  toggleFilePath(e.target.value)
                  e.target.value = ""
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Add a file from the project map…
                </option>
                {pickerCandidates
                  .filter((p) => !filePaths.includes(p))
                  .map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
              </select>
              <p className="hint" style={{ marginTop: 4 }}>
                Paths come from your project map — free-typed paths are not
                accepted.
              </p>
              {filePaths.length > 0 ? (
                <ul
                  className="file-list"
                  style={{ marginTop: 10 }}
                  aria-label="Picked file paths"
                >
                  {filePaths.map((p) => (
                    <li className="file-card" key={p}>
                      <div className="file-card-head">
                        <code className="file-path">{p}</code>
                        {inScopeSet.has(p) ? (
                          <span className="badge badge-soft">in scope</span>
                        ) : outOfScopeSet.has(p) ? (
                          <span className="badge badge-soft">out of scope</span>
                        ) : (
                          <span className="badge badge-soft">in map</span>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => toggleFilePath(p)}
                          disabled={busy}
                          aria-label={`Remove ${p}`}
                          style={{ marginLeft: "auto" }}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="inline-note">
              <IconAlert size={14} /> No M6-named paths available for this
              challenge.
            </p>
          )}
        </div>

        {/* Optional snippets — illustrative, not graded (R3 / FR-7). */}
        <div style={{ marginTop: 18 }}>
          <div className="review-section-head">
            <h3>Optional code snippets (notes to yourself)</h3>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => addSnippet()}
              disabled={busy || pickerCandidates.length === 0}
            >
              + Add a snippet
            </button>
          </div>
          <p className="inline-note">
            <strong>
              Snippets are illustrative — they are not scored for style,
              naming, or plausibility. Only your explanation above is graded.
            </strong>
          </p>
          {snippetsOpen && snippets.length > 0 ? (
            <ul className="file-list" aria-label="Attached snippets">
              {snippets.map((s, i) => (
                <li className="file-card" key={i}>
                  <fieldset disabled={busy}>
                    <legend>
                      Snippet for{" "}
                      <code className="code-chip">{s.path || "(no path)"}</code>
                    </legend>
                    <label
                      className="question-prompt"
                      htmlFor={`snippet-path-${i}`}
                    >
                      Path (from project map)
                    </label>
                    <select
                      id={`snippet-path-${i}`}
                      className="answer-input"
                      value={s.path}
                      onChange={(e) =>
                        updateSnippet(i, { path: e.target.value })
                      }
                    >
                      {pickerCandidates.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                    <label
                      className="question-prompt"
                      htmlFor={`snippet-code-${i}`}
                      style={{ marginTop: 8 }}
                    >
                      Code (illustrative — not graded)
                    </label>
                    <textarea
                      id={`snippet-code-${i}`}
                      className="answer-input"
                      value={s.code}
                      onChange={(e) =>
                        updateSnippet(i, { code: e.target.value })
                      }
                      rows={4}
                    />
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => removeSnippet(i)}
                      style={{ marginTop: 8 }}
                    >
                      Remove snippet
                    </button>
                  </fieldset>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {/* Submit area. */}
        <div className="check-submit" aria-busy={busy} style={{ marginTop: 18 }}>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => void submit()}
            disabled={busy}
          >
            {busy ? (
              <>
                <IconLoader size={14} /> Submitting your answer…
              </>
            ) : (
              <>
                <IconCheck size={14} /> Submit answer
              </>
            )}
          </button>
          <span className="check-submit-hint">
            {busy
              ? "Saving your answer and grading it — a few seconds."
              : explanation.trim() === ""
                ? "Your explanation is empty — you can submit anyway."
                : "Your answer is saved as soon as you submit. Grading takes a few seconds."}
          </span>
        </div>

        {phase === "error" ? (
          <div
            className="check-error"
            role="alert"
            aria-live="assertive"
            style={{ marginTop: 12 }}
          >
            <h3>
              <IconAlert size={15} /> Couldn&apos;t save your answer yet
            </h3>
            <p>
              This can happen if the AI grading service is unavailable. Your
              work is kept — try again.
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
        ) : null}

        {/* Internal hidden marker so tests can assert the host and route. */}
        <span
          data-testid="walkthrough-host"
          data-owner={owner}
          data-repo={repo}
          hidden
        />
      </div>
    </section>
  )
}
