import Link from "next/link"
import { notFound } from "next/navigation"

import {
  ensureLearningUnit,
  getLearningUnitView,
} from "@/lib/learning-units"

import {
  AiLabel,
  AppNav,
  Badge,
  IconAlert,
  IconArrowLeft,
  IconExternal,
  IconFileCode,
  relTime,
} from "../../../../_components/chrome"
import { ReviewChecklist } from "./_components/review-checklist"
import { UnderstandingQuestions } from "./_components/understanding-questions"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface WorkspacePageParams {
  params: Promise<{ owner: string; repo: string; issueRef: string }>
}

export async function generateMetadata({ params }: WorkspacePageParams) {
  const { owner, repo, issueRef } = await params
  const ref = decodeURIComponent(issueRef)
  return {
    title: `Learning unit ${ref} — ${owner}/${repo}`,
    description: `Coaching unit for issue ${ref} on ${owner}/${repo}: restated goal, related files, concepts, AI-agent execution notes, review checklist, understanding questions, and a challenge stub.`,
  }
}

/**
 * `/repos/[owner]/[repo]/issues/[issueRef]` — the Issue Learning Workspace
 * page (page spec `docs/design/issue-learning-workspace.page-spec.md`).
 *
 * Composes the three sub-UIs (Review Checklist, Understanding Questions,
 * Challenge Panel) over a typed `learning_units` row read from the M7
 * data-access layer (#135). On first visit, calls
 * {@link ensureLearningUnit} to run the bounded generation call (#133) and
 * persist the result. After generation, the integrity check (FR-4) runs at
 * the integration boundary — unresolved refs surface as an explicit error
 * state instead of broken links.
 */
export default async function IssueLearningWorkspacePage({
  params,
}: WorkspacePageParams) {
  const { owner, repo, issueRef: rawRef } = await params
  const issueRef = decodeURIComponent(rawRef)

  // First-visit guard: if no learning unit exists for this identity yet,
  // run the bounded generation call (server-side) and persist. Subsequent
  // visits short-circuit on the stored row.
  const view = await getLearningUnitView(owner, repo, issueRef)
  let unit: Awaited<ReturnType<typeof getLearningUnitView>>
  if (view.ok) {
    unit = view
  } else if (view.reason === "not-imported") {
    notFound()
  } else {
    // Generate.
    const ensure = await ensureLearningUnit(owner, repo, issueRef)
    if (!ensure.ok) {
      return (
        <GenerationErrorScreen
          owner={owner}
          repo={repo}
          issueRef={issueRef}
          errorKind={ensure.error.kind}
          message={ensure.error.message}
        />
      )
    }
    unit = await getLearningUnitView(owner, repo, issueRef)
    if (!unit.ok) notFound()
  }

  const u = unit.unit

  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <header>
            <Link
              className="back-link"
              href={`/repos/${u.repo.owner}/${u.repo.name}/issues`}
            >
              <IconArrowLeft size={14} /> Back to issues
            </Link>
            <div className="page-eyebrow" style={{ marginTop: 24 }}>
              <span className="dot" /> Issue learning · M7
            </div>
            <h1 className="page-title">{u.issueTitle}</h1>
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                fontSize: 13,
                color: "var(--fg-muted)",
              }}
            >
              <span>
                {u.repo.owner}/{u.repo.name} · {u.issueRef}
              </span>
              <Badge tone="info">
                {u.source === "ccpm-task" ? "CCPM task" : "GitHub issue"}
              </Badge>
              {u.issueUrl && (
                <a
                  href={u.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    gap: 4,
                    alignItems: "center",
                  }}
                >
                  View on GitHub <IconExternal size={12} />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
              <Badge soft mono>
                {u.repo.branch}
              </Badge>
              <AiLabel />
              <span>generated {relTime(u.createdAt)}</span>
              {u.score !== null && <span>· answered {relTime(u.updatedAt)}</span>}
            </div>
          </header>

          {!u.integrity.ok && (
            <p className="inline-note inline-warn" style={{ marginTop: 16 }}>
              <IconAlert size={15} />
              Some related-file references in this unit could not be resolved
              against the snapshot{" "}
              {u.integrity.unresolved
                .filter((r) => r.kind === "related-file")
                .map((r) => r.value)
                .join(", ")}
              . The unit still renders, but those paths are shown as plain
              text. Re-import the repo and re-generate the unit to refresh.
            </p>
          )}

          {/* §6a Restated goal */}
          <section className="unit-section" aria-labelledby="sec-goal">
            <div className="unit-section-head">
              <h2 id="sec-goal">What this issue is asking for</h2>
            </div>
            <p className="unit-prose">{u.restatedGoal}</p>
          </section>

          {/* §6b Related files */}
          <section className="unit-section" aria-labelledby="sec-files">
            <div className="unit-section-head">
              <h2 id="sec-files">Related files</h2>
              <span className="hint">
                {u.relatedFiles.length} file
                {u.relatedFiles.length === 1 ? "" : "s"} in play for this issue
              </span>
            </div>
            {u.relatedFiles.length > 0 ? (
              <ul className="unit-file-list">
                {u.relatedFiles.map((f) => (
                  <li
                    key={f.path}
                    className="unit-file-row"
                    data-unresolved={!f.resolved}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <IconFileCode size={14} />
                      <span className="unit-file-path">{f.path}</span>
                      {!f.resolved && (
                        <Badge tone="info">unresolved</Badge>
                      )}
                    </div>
                    <p className="unit-file-reason">{f.reason}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inline-note">
                <IconAlert size={15} />
                No related files identified for this issue.
              </p>
            )}
          </section>

          {/* §6c Concepts */}
          <section className="unit-section" aria-labelledby="sec-concepts">
            <div className="unit-section-head">
              <h2 id="sec-concepts">Concepts to understand</h2>
            </div>
            {u.concepts.length > 0 ? (
              <ul className="unit-concept-list">
                {u.concepts.map((c, i) => (
                  <li key={i} className="unit-concept">
                    <h3>{c.name}</h3>
                    <p>{c.explanation}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="inline-note">
                <IconAlert size={15} />
                No concepts were generated for this unit.
              </p>
            )}
          </section>

          {/* §6d AI-agent execution notes */}
          <section className="unit-section" aria-labelledby="sec-agent">
            <div className="unit-section-head">
              <h2 id="sec-agent">How an AI agent would approach this</h2>
              <AiLabel>AI-agent execution notes</AiLabel>
            </div>
            {u.agentExecutionNotes.length > 0 ? (
              <ol className="unit-steps">
                {u.agentExecutionNotes
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((s, i) => (
                    <li key={i}>{s.description}</li>
                  ))}
              </ol>
            ) : (
              <p className="inline-note">
                <IconAlert size={15} />
                No agent-execution notes were generated for this unit.
              </p>
            )}
          </section>

          {/* §6e Review checklist (Client Component island) */}
          <ReviewChecklist
            unitId={u.id}
            reviewChecklist={u.reviewChecklist}
            initialState={u.checklistState}
          />

          {/* §6f / §6g Understanding questions + Score / Weak area */}
          <UnderstandingQuestions
            unitId={u.id}
            questions={u.questions}
            initialAnswers={u.userAnswers}
            initialScore={u.score}
            initialWeakAreas={u.weakAreas}
            updatedAt={u.updatedAt}
          />

          <footer
            style={{
              marginTop: 56,
              paddingTop: 18,
              borderTop: "1px solid var(--border)",
              fontSize: 12,
              color: "var(--fg-subtle)",
            }}
          >
            {u.repo.owner}/{u.repo.name} · {u.issueRef} · milestone 7 · issue
            learning workspace
          </footer>
        </div>
      </main>
    </div>
  )
}

/**
 * Explicit failure screen for generation-time errors (missing API key,
 * integrity failure, LLM failure). Distinct from `notFound()` so the user can
 * read what went wrong and try again. Matches PRD US-7 ("never silently fake
 * functionality").
 */
function GenerationErrorScreen({
  owner,
  repo,
  issueRef,
  errorKind,
  message,
}: {
  owner: string
  repo: string
  issueRef: string
  errorKind: string
  message: string
}) {
  const title =
    errorKind === "integrity-failed"
      ? "We couldn't safely build a learning unit for this issue."
      : errorKind === "missing-api-key"
        ? "ANTHROPIC_API_KEY is not configured."
        : errorKind === "missing-input"
          ? "We couldn't find that issue or CCPM task."
          : "We couldn't generate the learning unit yet."

  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <Link
            className="back-link"
            href={`/repos/${owner}/${repo}/issues`}
          >
            <IconArrowLeft size={14} /> Back to issues
          </Link>
          <header style={{ marginTop: 24 }}>
            <div className="page-eyebrow">
              <span className="dot" /> Issue learning · M7
            </div>
            <h1 className="page-title">{title}</h1>
            <p className="page-subtitle">
              {owner}/{repo} · {issueRef}
            </p>
          </header>
          <section className="status-region">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  <IconAlert size={18} />
                </div>
                <h2 className="status-title">{title}</h2>
              </div>
              <p className="status-body">{message}</p>
              {errorKind === "integrity-failed" && (
                <p className="status-body">
                  The AI&apos;s output referenced files that don&apos;t exist
                  in the imported snapshot. Re-import the repo (so the
                  snapshot matches the issue&apos;s real code) and try again.
                </p>
              )}
              {errorKind === "missing-api-key" && (
                <p className="status-body">
                  The learning unit is generated by an Anthropic bounded SDK
                  call (ADR 0005). Set <span className="mono">
                    ANTHROPIC_API_KEY
                  </span>{" "}
                  in <span className="mono">.env</span> and reload.
                </p>
              )}
              <div className="status-actions">
                <Link
                  className="btn btn-primary"
                  href={`/repos/${owner}/${repo}/issues`}
                >
                  Back to issues list
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
