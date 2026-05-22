"use client"

import type {
  RecommendationIntake,
  RecommendationNarrative,
} from "@workspace/db"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Cpu,
  LoaderCircle,
  Pencil,
  Sparkles,
  X,
} from "lucide-react"
import Link from "next/link"
import { useEffect, useState, useTransition } from "react"

import type { ResolvedRecommendation } from "@/lib/recommendations"

import { generateNarrativeAction, updateRecommendationAction } from "../actions"
import { AppNav, Badge } from "./chrome"

/** Render a timestamp as a short relative string. */
function relativeTime(value: Date | string): string {
  const date = new Date(value)
  const seconds = (Date.now() - date.getTime()) / 1000
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr ago`
  if (seconds < 86400 * 7) return `${Math.round(seconds / 86400)} d ago`
  return date.toLocaleDateString()
}

/**
 * The `/recommend/[id]` result view (page spec §6–§12). A Client Component
 * over server-resolved data: it owns the read view, the in-place edit mode
 * (FR-7), and the generate-coaching-notes action. All data access happened
 * server-side; this component never touches the database.
 */
export function ResultView({ data }: { data: ResolvedRecommendation }) {
  const { recommendation: rec, goldenPath, templates, rejected } = data
  const edited =
    new Date(rec.updatedAt).getTime() - new Date(rec.createdAt).getTime() >
    1000

  const [editing, setEditing] = useState(false)
  const [editGoldenPath, setEditGoldenPath] = useState(
    rec.recommendedGoldenPathSlug,
  )
  const [editNarrative, setEditNarrative] =
    useState<RecommendationNarrative | null>(rec.narrative)
  const [toast, setToast] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(false), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  function startEditing() {
    setEditGoldenPath(rec.recommendedGoldenPathSlug)
    setEditNarrative(rec.narrative ? { ...rec.narrative } : null)
    setEditing(true)
  }

  function save() {
    startTransition(async () => {
      await updateRecommendationAction(rec.id, {
        recommendedGoldenPathSlug: editGoldenPath,
        ...(editNarrative ? { narrative: editNarrative } : {}),
      })
      setEditing(false)
      setToast(true)
    })
  }

  function generateNarrative() {
    startTransition(async () => {
      await generateNarrativeAction(rec.id)
    })
  }

  return (
    <div className="screen">
      <AppNav active="recommend" />
      <main className="page">
        <div className="container-narrow">
          <Link className="back-link" href="/recommend">
            <ArrowLeft size={14} />
            Get another recommendation
          </Link>

          {editing && (
            <div className="r-edit-banner" role="status" aria-live="polite">
              <Pencil size={13} />
              Editing recommendation · changes are saved when you press Save
            </div>
          )}

          <div className="r-result-head">
            <div>
              <div className="page-eyebrow">
                <span className="dot" /> Recommendation #{rec.id}
              </div>
              <h1>Your recommended path</h1>
              <div className="r-result-meta">
                <span>Generated {relativeTime(rec.createdAt)}</span>
                {edited && (
                  <>
                    <span>·</span>
                    <span>edited {relativeTime(rec.updatedAt)}</span>
                  </>
                )}
              </div>
            </div>
            <div className="r-result-actions">
              {editing ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setEditing(false)}
                    disabled={pending}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={save}
                    disabled={pending}
                  >
                    {pending ? (
                      <LoaderCircle size={14} className="recommend-spin" />
                    ) : (
                      <Check size={14} />
                    )}
                    Save
                  </button>
                </>
              ) : (
                <button type="button" className="btn" onClick={startEditing}>
                  <Pencil size={13} />
                  Edit
                </button>
              )}
            </div>
          </div>

          <IntakeSummary intake={rec.intake} />

          {/* Recommended Golden Path */}
          <section className="r-headline" aria-labelledby="rec-gp">
            <div className="r-headline-eyebrow">
              <Sparkles size={12} />
              Recommended Golden Path
            </div>
            {editing ? (
              <div>
                <label className="r-field-label" htmlFor="edit-gp">
                  Recommended Golden Path
                </label>
                <select
                  className="r-select"
                  id="edit-gp"
                  value={editGoldenPath}
                  onChange={(event) => setEditGoldenPath(event.target.value)}
                  style={{ marginTop: 8, maxWidth: 480 }}
                >
                  {data.goldenPathOptions.map((option) => (
                    <option key={option.slug} value={option.slug}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <h2 id="rec-gp" className="r-headline-name">
                  {goldenPath?.name ?? rec.recommendedGoldenPathSlug}
                </h2>
                {goldenPath?.summary && (
                  <p className="r-headline-summary">{goldenPath.summary}</p>
                )}
                <div className="r-headline-actions">
                  <Link
                    className="btn btn-primary btn-lg"
                    href={`/catalog/${rec.recommendedGoldenPathSlug}`}
                    aria-label={`View Golden Path: ${
                      goldenPath?.name ?? rec.recommendedGoldenPathSlug
                    }`}
                  >
                    View this Golden Path
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </>
            )}
          </section>

          {/* Recommended templates */}
          {templates.length > 0 && (
            <section className="stack-section" aria-labelledby="rec-tpl">
              <div className="stack-section-head">
                <h2 id="rec-tpl">Templates this builds on</h2>
                <span className="hint">the building blocks for this path</span>
              </div>
              <ul className="r-tpl-grid">
                {templates.map((template) => (
                  <li key={template.slug}>
                    <Link
                      className="r-tpl-card"
                      href={`/templates/${template.slug}`}
                      aria-label={`View template: ${template.name}`}
                    >
                      <div className="r-tpl-card-head">
                        <span className="r-tpl-card-name">{template.name}</span>
                        <Badge>{template.category}</Badge>
                      </div>
                      <div className="r-tpl-card-summary">
                        {template.summary}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Coaching narrative */}
          <section className="stack-section" aria-labelledby="rec-narr">
            <div className="stack-section-head">
              <h2 id="rec-narr">Why this fits, in plain words</h2>
              <span className="hint">
                coaching notes — generated, then yours to edit
              </span>
            </div>

            <div className="r-narr-provenance" aria-label="Provenance">
              <Cpu size={12} />
              AI-generated coaching notes · based on a deterministic
              recommendation
            </div>

            {rec.narrative ? (
              editing && editNarrative ? (
                <NarrativeEditor
                  narrative={editNarrative}
                  onChange={setEditNarrative}
                />
              ) : (
                <NarrativeContent narrative={rec.narrative} />
              )
            ) : (
              <NarrativeMissing
                pending={pending}
                onGenerate={generateNarrative}
              />
            )}
          </section>

          {/* Rejected alternatives */}
          <section className="stack-section" aria-labelledby="rec-rejected">
            <div className="stack-section-head">
              <h2 id="rec-rejected">Other paths we considered</h2>
              <span className="hint">…and why we didn&apos;t pick them</span>
            </div>
            <ul className="r-rejected">
              {rejected.map((alternative) => (
                <li key={`${alternative.kind}-${alternative.slug}`}>
                  <div className="r-rejected-head">
                    <span className="r-rejected-name">
                      {alternative.href ? (
                        <Link
                          href={alternative.href}
                          aria-label={`View ${
                            alternative.kind === "golden_path"
                              ? "Golden Path"
                              : "Template"
                          }: ${alternative.name}`}
                        >
                          {alternative.name}
                        </Link>
                      ) : (
                        alternative.name
                      )}
                    </span>
                    <span className="r-rejected-kind">
                      {alternative.kind === "golden_path"
                        ? "Golden Path"
                        : "Template"}
                    </span>
                  </div>
                  <div className="r-rejected-reason">{alternative.reason}</div>
                </li>
              ))}
            </ul>
          </section>

          <footer
            style={{
              marginTop: 56,
              color: "var(--fg-subtle)",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
          >
            recommendation #{rec.id} · milestone 4
          </footer>
        </div>
      </main>

      {toast && (
        <div className="r-toast" role="status">
          <Check size={14} />
          Recommendation updated
        </div>
      )}
    </div>
  )
}

/* ---------- Intake summary ---------- */

function IntakeSummary({ intake }: { intake: RecommendationIntake }) {
  const cells: { label: string; value: string }[] = [
    { label: "Goal", value: intake.goal },
    { label: "Experience", value: intake.experienceLevel },
    { label: "Job target", value: intake.jobTarget },
    { label: "Project type", value: intake.projectType },
    { label: "Time budget", value: intake.timeBudget },
    { label: "Complexity", value: intake.complexityTolerance },
    { label: "AI tool", value: intake.aiToolPreference },
    { label: "Learning focus", value: intake.learningFocus },
  ]
  return (
    <details className="r-intake-summary">
      <summary>
        <span className="label">What we based this on</span>
        <span className="caret" aria-hidden="true">
          <ChevronDown size={14} />
        </span>
      </summary>
      <div className="r-intake-grid">
        {cells.map((cell) => (
          <div className="r-intake-cell" key={cell.label}>
            <div className="r-intake-label">{cell.label}</div>
            <div className="r-intake-value">
              {cell.value || (
                <span style={{ color: "var(--fg-subtle)" }}>—</span>
              )}
            </div>
          </div>
        ))}
        <div className="r-intake-cell" style={{ gridColumn: "1 / -1" }}>
          <div className="r-intake-label">Known stack</div>
          <div className="r-intake-chips">
            {intake.knownStack.length === 0 ? (
              <span style={{ color: "var(--fg-subtle)", fontSize: 13.5 }}>
                none provided
              </span>
            ) : (
              intake.knownStack.map((tech) => (
                <span className="chip" key={tech}>
                  {tech}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </details>
  )
}

/* ---------- Narrative — read view ---------- */

function NarrativeContent({
  narrative,
}: {
  narrative: RecommendationNarrative
}) {
  return (
    <>
      <article className="r-narr-section">
        <h3>Why this fits you</h3>
        <p>{narrative.whyItFits}</p>
      </article>
      <article className="r-narr-section r-narr-risks">
        <h3>Complexity risks to watch</h3>
        <p>{narrative.complexityRisks}</p>
      </article>
      <article className="r-narr-section">
        <h3>Learning checkpoints</h3>
        <ul className="check-list">
          {narrative.learningCheckpoints.map((checkpoint, index) => (
            <li key={index}>
              <Check size={16} />
              <span>{checkpoint}</span>
            </li>
          ))}
        </ul>
      </article>
      <article className="r-narr-section r-narr-portfolio">
        <h3>Portfolio &amp; interview value</h3>
        <p>{narrative.portfolioValue}</p>
      </article>
    </>
  )
}

/* ---------- Narrative — edit view (FR-7) ---------- */

function NarrativeEditor({
  narrative,
  onChange,
}: {
  narrative: RecommendationNarrative
  onChange: (narrative: RecommendationNarrative) => void
}) {
  function patch(fields: Partial<RecommendationNarrative>) {
    onChange({ ...narrative, ...fields })
  }
  const checkpoints = narrative.learningCheckpoints

  return (
    <>
      <article className="r-narr-section">
        <h3>Why this fits you</h3>
        <textarea
          className="r-textarea"
          aria-label="Why this fits you"
          value={narrative.whyItFits}
          onChange={(event) => patch({ whyItFits: event.target.value })}
        />
      </article>
      <article className="r-narr-section r-narr-risks">
        <h3>Complexity risks to watch</h3>
        <textarea
          className="r-textarea"
          aria-label="Complexity risks to watch"
          value={narrative.complexityRisks}
          onChange={(event) => patch({ complexityRisks: event.target.value })}
        />
      </article>
      <article className="r-narr-section">
        <h3>Learning checkpoints</h3>
        <div className="r-narr-edit">
          {checkpoints.map((checkpoint, index) => (
            <div className="r-narr-checkpoint-row" key={index}>
              <input
                className="r-input"
                aria-label={`Checkpoint ${index + 1}`}
                value={checkpoint}
                onChange={(event) =>
                  patch({
                    learningCheckpoints: checkpoints.map((item, itemIndex) =>
                      itemIndex === index ? event.target.value : item,
                    ),
                  })
                }
              />
              <button
                type="button"
                className="btn btn-ghost"
                aria-label={`Remove checkpoint ${index + 1}`}
                onClick={() =>
                  patch({
                    learningCheckpoints: checkpoints.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  })
                }
              >
                <X size={13} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn"
            style={{ marginTop: 6, justifySelf: "start" }}
            onClick={() =>
              patch({ learningCheckpoints: [...checkpoints, ""] })
            }
          >
            + Add checkpoint
          </button>
        </div>
      </article>
      <article className="r-narr-section r-narr-portfolio">
        <h3>Portfolio &amp; interview value</h3>
        <textarea
          className="r-textarea"
          aria-label="Portfolio and interview value"
          value={narrative.portfolioValue}
          onChange={(event) => patch({ portfolioValue: event.target.value })}
        />
      </article>
    </>
  )
}

/* ---------- Narrative — unavailable (page spec §11) ---------- */

function NarrativeMissing({
  pending,
  onGenerate,
}: {
  pending: boolean
  onGenerate: () => void
}) {
  return (
    <div className="r-narr-missing" role="status" aria-live="polite">
      <div className="head">
        <div className="icon" aria-hidden="true">
          <Cpu size={18} />
        </div>
        <h3>Coaching notes aren&apos;t ready yet</h3>
      </div>
      <p>
        The recommendation below is ready — your Golden Path, the templates, and
        the alternatives we ruled out are all visible. The written coaching
        notes couldn&apos;t be generated this time; this usually happens when
        the AI service is unavailable or no API key is configured.
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onGenerate}
          disabled={pending}
        >
          {pending ? (
            <LoaderCircle size={14} className="recommend-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          Generate coaching notes
        </button>
      </div>
    </div>
  )
}
