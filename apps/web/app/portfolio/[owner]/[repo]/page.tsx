import Link from "next/link"
import { notFound } from "next/navigation"

import type {
  ArchitectureExplanation,
  ArchitectureExplanationSection,
  DebugStory,
  InterviewQA,
  LearningMemoryRevisitEntry,
  LearningMemoryTree,
  LearningMemoryTreeBranch,
  LearningMemoryTreeLeaf,
  ResumeBullet,
} from "@workspace/db"

import { getPortfolioPageData } from "@/lib/portfolio"

import {
  AiLabel,
  AppNav,
  Badge,
  IconArrowLeft,
  IconExternal,
  relTime,
  sourceHref,
} from "./_components/chrome"
import { ExportButtons } from "./_components/export-buttons"
import { PortfolioEmpty } from "./_components/portfolio-empty"
import { RegenerateButton } from "./_components/regenerate-button"
import { StaleBanner } from "./_components/stale-banner"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface PortfolioParams {
  params: Promise<{ owner: string; repo: string }>
}

export async function generateMetadata({ params }: PortfolioParams) {
  const { owner, repo } = await params
  return {
    title: `Portfolio — ${owner}/${repo}`,
    description: `Learning memory and portfolio artifacts for ${owner}/${repo}, grounded in your repo.`,
  }
}

/**
 * `/portfolio/[owner]/[repo]` — the M10 Portfolio Page (Page Spec §4 / §6,
 * task #184). A React Server Component shell that reads the cached learning
 * memory for the imported snapshot and renders the five artifact sections
 * in fixed order (architecture → memory tree → Q&A → bullets → debug
 * stories) with anchor nav, the three top-level actions, and the
 * stale-data banner.
 *
 * **No LLM calls at view time** — the page is read-only against the
 * cached `learning_memories` row (PRD FR-8). The only SDK path is inside
 * the Regenerate Server Action when the user explicitly clicks it.
 */
export default async function PortfolioPage({ params }: PortfolioParams) {
  const { owner, repo } = await params
  const data = await getPortfolioPageData(owner, repo)

  if (!data.snapshotExists || !data.identity) {
    notFound()
  }

  const { identity, memory, stale } = data
  const hasMemory = memory !== null

  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          {/* ── Header ─────────────────────────────────────────────── */}
          <header>
            <Link className="back-link" href="/import">
              <IconArrowLeft size={14} /> Back to imported repositories
            </Link>
            <div className="page-eyebrow" style={{ marginTop: 24 }}>
              <span className="dot" /> Portfolio · M10
            </div>
            <div className="review-titlewrap" style={{ marginTop: 0 }}>
              <h1 className="page-title" style={{ margin: 0 }}>
                {identity.owner}/{identity.repo}
              </h1>
              <Badge soft mono>
                {identity.branch}
              </Badge>
              <AiLabel>
                AI-generated Q&amp;A and résumé bullets, grounded in your repo
              </AiLabel>
            </div>
            <p className="page-subtitle" style={{ marginTop: 16 }}>
              Your learning memory + portfolio artifacts for this repository.
            </p>
            <div
              className="status-actions"
              style={{ marginTop: 14, gap: 8, flexWrap: "wrap" }}
            >
              <RegenerateButton snapshotId={identity.snapshotId} />
              <ExportButtons
                owner={identity.owner}
                repo={identity.repo}
                disabled={!hasMemory}
              />
              {memory && (
                <span className="hint" style={{ marginLeft: 8 }}>
                  generated {relTime(memory.generatedAt)}
                </span>
              )}
            </div>
          </header>

          {/* ── Empty state (Page Spec §10) ────────────────────────── */}
          {!hasMemory && (
            <PortfolioEmpty snapshotId={identity.snapshotId} />
          )}

          {hasMemory && memory && (
            <>
              {/* ── Stale-data banner (§6a, only when stale) ──────── */}
              {stale && <StaleBanner snapshotId={identity.snapshotId} />}

              {/* ── In-page anchor nav (§6 item 4) ────────────────── */}
              <nav
                aria-label="In-page sections"
                className="review-section"
                style={{ marginTop: 16 }}
              >
                <ul
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 12,
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                  }}
                >
                  <li>
                    <a href="#architecture">Architecture</a>
                  </li>
                  <li>
                    <a href="#memory-tree">Memory tree</a>
                  </li>
                  <li>
                    <a href="#interview-qa">Interview Q&amp;A</a>
                  </li>
                  <li>
                    <a href="#resume-bullets">Résumé bullets</a>
                  </li>
                  <li>
                    <a href="#debug-stories">Debug stories</a>
                  </li>
                </ul>
              </nav>

              {/* ── The five artifact sections, in fixed order ────── */}
              <ArchitectureSection
                explanation={memory.architectureExplanation}
              />
              <MemoryTreeSection
                tree={memory.learningMemoryTree}
                owner={identity.owner}
                repo={identity.repo}
              />
              <InterviewQASection items={memory.interviewQa} />
              <ResumeBulletsSection items={memory.resumeBullets} />
              <DebugStoriesSection
                stories={memory.debugStories}
                owner={identity.owner}
                repo={identity.repo}
              />

              {/* ── Footnote (§6 item 6) ─────────────────────────── */}
              <p
                className="check-intro"
                style={{ marginTop: 24, color: "var(--muted)" }}
              >
                Cached per imported repository. Click <em>Regenerate memory</em>{" "}
                to refresh after working through more of M5–M9.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

/* ── Section: Architecture Explanation (§6b) ───────────────────────────── */

function ArchitectureSection({
  explanation,
}: {
  explanation: ArchitectureExplanation
}) {
  const empty =
    explanation.intro.length === 0 &&
    explanation.stackSection.body.length === 0 &&
    explanation.architectureSection.body.length === 0 &&
    explanation.keyFlowsSection.body.length === 0
  return (
    <section
      id="architecture"
      className="review-section"
      aria-labelledby="h-architecture"
    >
      <div className="review-section-head">
        <h2 id="h-architecture" tabIndex={-1}>
          Architecture Explanation
        </h2>
        <span className="hint">
          Composed deterministically from your stack explainer and project
          map — no LLM call.
        </span>
      </div>
      {empty ? (
        <p className="file-explanation">
          Not yet — generate your stack explanation and project map first.
        </p>
      ) : (
        <>
          {explanation.intro && (
            <p className="file-explanation">{explanation.intro}</p>
          )}
          <ArchitectureSubSection section={explanation.stackSection} />
          <ArchitectureSubSection section={explanation.architectureSection} />
          <ArchitectureSubSection section={explanation.keyFlowsSection} />
        </>
      )}
    </section>
  )
}

function ArchitectureSubSection({
  section,
}: {
  section: ArchitectureExplanationSection
}) {
  if (!section.heading && !section.body) return null
  return (
    <div style={{ marginTop: 12 }}>
      <h3>{section.heading}</h3>
      {section.body && <p className="file-explanation">{section.body}</p>}
      {section.citedFiles.length > 0 && (
        <div className="file-counts" style={{ marginTop: 6 }}>
          {section.citedFiles.map((p) => (
            <code
              className="code-chip"
              key={p}
              style={{ marginRight: 6 }}
            >
              {p}
            </code>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Section: Learning Memory Tree (§6c) ───────────────────────────────── */

function MemoryTreeSection({
  tree,
  owner,
  repo,
}: {
  tree: LearningMemoryTree
  owner: string
  repo: string
}) {
  return (
    <section
      id="memory-tree"
      className="review-section"
      aria-labelledby="h-memory-tree"
    >
      <div className="review-section-head">
        <h2 id="h-memory-tree" tabIndex={-1}>
          Learning Memory Tree
        </h2>
        <span className="hint">
          Things you now understand about this repo, with a link back to the
          M7/M8/M9 row that taught each one.
        </span>
      </div>
      {tree.branches.length === 0 && tree.stillToRevisit.length === 0 ? (
        <p className="file-explanation">
          Not yet — work through some issues, diffs, and challenges to build
          your memory tree.
        </p>
      ) : (
        <>
          {tree.branches.map((branch) => (
            <MemoryTreeBranch
              branch={branch}
              owner={owner}
              repo={repo}
              key={branch.heading}
            />
          ))}
          <StillToRevisitBlock
            entries={tree.stillToRevisit}
            owner={owner}
            repo={repo}
          />
        </>
      )}
    </section>
  )
}

function MemoryTreeBranch({
  branch,
  owner,
  repo,
}: {
  branch: LearningMemoryTreeBranch
  owner: string
  repo: string
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <h3>{branch.heading}</h3>
      <ul style={{ paddingLeft: 18 }}>
        {branch.leaves.map((leaf, i) => (
          <MemoryTreeLeafItem
            leaf={leaf}
            owner={owner}
            repo={repo}
            key={`${leaf.concept}-${i}`}
          />
        ))}
      </ul>
    </div>
  )
}

function MemoryTreeLeafItem({
  leaf,
  owner,
  repo,
}: {
  leaf: LearningMemoryTreeLeaf
  owner: string
  repo: string
}) {
  const href = sourceHref(leaf.source, owner, repo)
  return (
    <li style={{ marginBottom: 8 }}>
      <strong>{leaf.concept}</strong>
      {leaf.detail && <span> — {leaf.detail}</span>}
      {leaf.source.locator && (
        <code className="code-chip" style={{ marginLeft: 6 }}>
          {leaf.source.locator}
        </code>
      )}
      <span style={{ marginLeft: 6 }}>
        <Link className="hint" href={href}>
          Learned in {leaf.source.milestone} #{leaf.source.rowId} →
        </Link>
      </span>
    </li>
  )
}

function StillToRevisitBlock({
  entries,
  owner,
  repo,
}: {
  entries: LearningMemoryRevisitEntry[]
  owner: string
  repo: string
}) {
  return (
    <div style={{ marginTop: 16 }}>
      <h3>Still to revisit</h3>
      <p className="hint">
        Weak-area entries from your M7/M8/M9 grading. These are what you
        should brush up on before an interview.
      </p>
      {entries.length === 0 ? (
        <p className="hint">
          Nothing currently flagged — keep working through challenges to keep
          it honest.
        </p>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {entries.map((entry, i) => (
            <li
              key={`${entry.area}-${entry.source.milestone}-${entry.source.rowId}-${i}`}
              style={{ marginBottom: 8 }}
            >
              <article>
                <h4 style={{ margin: "4px 0" }}>{entry.area}</h4>
                <p className="file-explanation" style={{ marginBottom: 4 }}>
                  {entry.detail}
                </p>
                <Link
                  className="hint"
                  href={sourceHref(entry.source, owner, repo)}
                >
                  Surfaced in {entry.source.milestone} #{entry.source.rowId} →
                </Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── Section: Interview Q&A (§6d) ──────────────────────────────────────── */

function InterviewQASection({ items }: { items: InterviewQA[] }) {
  return (
    <section
      id="interview-qa"
      className="review-section"
      aria-labelledby="h-interview-qa"
    >
      <div className="review-section-head">
        <h2 id="h-interview-qa" tabIndex={-1}>
          Interview Q&amp;A
        </h2>
        <span className="hint">
          Generated by a bounded Anthropic SDK call from your M5/M6/M7/M8/M9
          rows; every answer cites a real file path or stack entry.
        </span>
      </div>
      {items.length === 0 ? (
        <p className="file-explanation">
          Not yet generated — click <em>Regenerate memory</em> in the header.
        </p>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: "none" }}>
          {items.map((item, i) => (
            <li
              key={`${item.groundArea}-${i}`}
              className="file-card"
              style={{ marginBottom: 12 }}
            >
              <div className="file-card-head">
                <h3 style={{ margin: 0 }}>{item.question}</h3>
                <Badge soft>{groundAreaLabel(item.groundArea)}</Badge>
              </div>
              <p className="file-explanation" style={{ marginTop: 8 }}>
                {item.answer}
              </p>
              {item.sourceReferences.length > 0 && (
                <div className="file-counts" style={{ marginTop: 6 }}>
                  {item.sourceReferences.map((ref) => (
                    <code
                      className="code-chip"
                      key={ref}
                      style={{ marginRight: 6 }}
                    >
                      {ref}
                    </code>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function groundAreaLabel(area: InterviewQA["groundArea"]): string {
  switch (area) {
    case "stack":
      return "Stack"
    case "architecture":
      return "Architecture"
    case "issue-learning":
      return "Issue learning"
    case "diff-review":
      return "Diff & risk"
    case "debug-expansion":
      return "Debug & expansion"
  }
}

/* ── Section: Résumé Bullets (§6e) ─────────────────────────────────────── */

function ResumeBulletsSection({ items }: { items: ResumeBullet[] }) {
  return (
    <section
      id="resume-bullets"
      className="review-section"
      aria-labelledby="h-resume-bullets"
    >
      <div className="review-section-head">
        <h2 id="h-resume-bullets" tabIndex={-1}>
          Résumé Bullets
        </h2>
        <span className="hint">
          Generated by a bounded Anthropic SDK call; ≤ 160 characters each,
          in verb + outcome + technology form.
        </span>
      </div>
      {items.length === 0 ? (
        <p className="file-explanation">
          Not yet generated — click <em>Regenerate memory</em> in the header.
        </p>
      ) : (
        <ul style={{ paddingLeft: 18 }}>
          {items.map((b, i) => (
            <li key={`${i}-${b.text.slice(0, 24)}`} style={{ marginBottom: 12 }}>
              <p style={{ margin: 0 }}>{b.text}</p>
              {(b.technologies.length > 0 || b.sourceFiles.length > 0) && (
                <div className="file-counts" style={{ marginTop: 4 }}>
                  {b.technologies.map((t) => (
                    <code
                      className="code-chip"
                      key={`t-${t}`}
                      style={{ marginRight: 6 }}
                    >
                      {t}
                    </code>
                  ))}
                  {b.sourceFiles.map((f) => (
                    <code
                      className="code-chip"
                      key={`f-${f}`}
                      style={{ marginRight: 6 }}
                    >
                      {f}
                    </code>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ── Section: Debug Stories (§6f) ──────────────────────────────────────── */

function DebugStoriesSection({
  stories,
  owner,
  repo,
}: {
  stories: DebugStory[]
  owner: string
  repo: string
}) {
  // Suppress the unused-var warning until we wire deep links to challenges
  // — the route shape needs the challenge id, which the shipped DebugStory
  // type does not carry (see integration notes for the drift watch).
  void owner
  void repo
  return (
    <section
      id="debug-stories"
      className="review-section"
      aria-labelledby="h-debug-stories"
    >
      <div className="review-section-head">
        <h2 id="h-debug-stories" tabIndex={-1}>
          Debug Stories
        </h2>
        <span className="hint">
          Composed deterministically from your M9 challenge attempts.
        </span>
      </div>
      {stories.length === 0 ? (
        <p className="file-explanation">
          Not yet — work through some M9 challenges to populate your debug
          stories.
        </p>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: "none" }}>
          {stories.map((story, i) => (
            <li
              key={`${story.challengeType}-${i}`}
              className="file-card"
              style={{ marginBottom: 12 }}
            >
              <div className="file-card-head">
                <h3 style={{ margin: 0 }}>{story.challengeType}</h3>
                <Badge tone={story.gradingResult.passed ? "ok" : "warn"}>
                  {story.gradingResult.score}/100
                </Badge>
              </div>
              <p className="file-explanation" style={{ marginTop: 8 }}>
                {story.taskSummary}
              </p>
              <blockquote
                style={{
                  borderLeft: "3px solid var(--border)",
                  paddingLeft: 12,
                  margin: "8px 0",
                  color: "var(--muted)",
                }}
              >
                {story.explanationExcerpt}
              </blockquote>
              {story.gradingResult.topWeakArea && (
                <p className="hint">
                  Top weak area: {story.gradingResult.topWeakArea.area} —{" "}
                  {story.gradingResult.topWeakArea.detail}
                </p>
              )}
              <Link
                className="hint"
                href={`/repos/${owner}/${repo}/challenges`}
              >
                View challenges <IconExternal size={12} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
