// PDF exporter for the M10 Learning Memory & Portfolio Export epic
// (`learning-memory-portfolio-export` PRD FR-7, Issue #183).
//
// Renders a `learning_memories` row + its parent `repo_snapshots` row as a
// single `portfolio.pdf` suitable for résumé attachment. The PDF carries the
// *same content* as the markdown bundle's combined `portfolio.md` (#182) —
// the only thing that changes is the container: PDF instead of markdown ZIP.
// Section order matches the Portfolio Page spec §6 (`docs/design/
// portfolio-page.page-spec.md`):
//
//   1. architecture
//   2. learning memory tree (incl. "Still to revisit" weak areas, PRD FR-4)
//   3. interview Q&A
//   4. résumé bullets
//   5. debug stories
//
// Public surface is the one async function `renderPortfolioPdf` — `Buffer`
// out, no rendering primitives leaking. Hiding the library behind a single
// edge keeps it swappable per the M9 "official-installation rule"
// retrospective (CLAUDE.md): if we ever swap `@react-pdf/renderer` for
// `pdfkit` or a headless-Chromium rasterizer, only this file changes.
//
// PDF library: **@react-pdf/renderer@^4.5.1** — pure-React, no headless
// browser, native peer support for React 19 (verified via npm metadata),
// matches the local-first / no-extra-binary footprint the M10 PRD asks
// for. Install source: the official `@react-pdf/renderer` README on
// <https://react-pdf.org>. See `docs/current/pdf-and-zip-libraries.md` for
// the locked decision + alternatives considered.
//
// **Server-side only.** `@react-pdf/renderer`'s `renderToBuffer` resolves
// the PDF as a Node `Buffer`, which is unavailable in the browser. The
// `packages/db/package.json#exports` map is server-targeted; importing this
// module from a Client Component will fail at build time. Wire the export
// through a Server Action, never an `"use client"` boundary.

import { Buffer } from "node:buffer"
import React from "react"
import type { DocumentProps } from "@react-pdf/renderer"
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"

import type {
  ArchitectureExplanation,
  ArchitectureExplanationSection,
  DebugStory,
  InterviewQA,
  LearningMemory,
  LearningMemoryRevisitEntry,
  LearningMemoryTree,
  LearningMemoryTreeBranch,
  LearningMemoryTreeLeaf,
  RepoSnapshot,
  ResumeBullet,
} from "../schema"
import { portfolioFilenameStem } from "./_filename-slug"

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/** The rendered PDF + the filename the Server Action should serve it as. */
export interface PortfolioPdf {
  /** PDF bytes ready to hand to a `Response` body. */
  pdf: Buffer
  /** Filename the Server Action should serve the download as. */
  pdfFilename: string
}

/**
 * Render a learning memory + its snapshot as a single `portfolio.pdf` Buffer
 * for résumé attachment (PRD FR-7). Section order matches the markdown
 * bundle's combined `portfolio.md` (#182) and the Portfolio Page spec §6 —
 * architecture → memory tree → Q&A → bullets → debug stories.
 *
 * `async` because `@react-pdf/renderer.renderToBuffer` returns a Promise;
 * the function itself does no I/O, no clock reads, no randomness.
 *
 * Server-side only — see the file header. Importing this module from a
 * browser bundle will fail because `Buffer` and the pdfkit/font stack are
 * Node-only.
 */
export async function renderPortfolioPdf(
  memory: LearningMemory,
  snapshot: RepoSnapshot,
): Promise<PortfolioPdf> {
  const documentEl = renderDocument(memory, snapshot)
  const pdf = await renderToBuffer(documentEl)
  const pdfFilename = `${portfolioFilenameStem(
    snapshot.owner,
    snapshot.repo,
    snapshot.id,
  )}.pdf`
  return { pdf, pdfFilename }
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

// PDFs render with the library's default font (Helvetica) — we do NOT call
// `Font.register` so no external font files are loaded at runtime. The
// Portfolio Page favours readability over decoration; this stays consistent.

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10.5,
    lineHeight: 1.45,
    color: "#1f1f1f",
  },
  h1: {
    fontSize: 22,
    marginBottom: 6,
    fontWeight: 700,
  },
  h2: {
    fontSize: 16,
    marginTop: 18,
    marginBottom: 6,
    fontWeight: 700,
  },
  h3: {
    fontSize: 12,
    marginTop: 10,
    marginBottom: 4,
    fontWeight: 700,
  },
  intro: {
    fontSize: 10.5,
    marginBottom: 10,
    color: "#3a3a3a",
  },
  paragraph: {
    marginBottom: 6,
  },
  bodyBlock: {
    marginBottom: 6,
  },
  bullet: {
    flexDirection: "row",
    marginBottom: 3,
  },
  bulletMark: {
    width: 10,
  },
  bulletBody: {
    flex: 1,
  },
  citedLabel: {
    marginTop: 4,
    fontWeight: 700,
  },
  monoLine: {
    fontFamily: "Courier",
    fontSize: 9.5,
  },
  divider: {
    marginTop: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#d0d0d0",
  },
  emptyNote: {
    marginBottom: 6,
    fontStyle: "italic",
    color: "#5a5a5a",
  },
  metaLine: {
    fontSize: 9.5,
    color: "#5a5a5a",
    marginBottom: 4,
  },
  qaLabel: {
    marginTop: 2,
    fontWeight: 700,
  },
})

// ---------------------------------------------------------------------------
// Document composition — sections render in the fixed Portfolio Page order
// (§6 of `docs/design/portfolio-page.page-spec.md`).
// ---------------------------------------------------------------------------

function renderDocument(
  memory: LearningMemory,
  snapshot: RepoSnapshot,
): React.ReactElement<DocumentProps> {
  return React.createElement<DocumentProps>(
    Document,
    {
      title: `Portfolio — ${snapshot.owner}/${snapshot.repo}`,
      author: "Industrial Coding Coach",
      subject: "Learning Memory & Portfolio export",
    },
    React.createElement(
      Page,
      { size: "A4", style: styles.page, wrap: true },
      // Header block — repo identity + ref/commit + a one-line frame.
      React.createElement(
        Text,
        { style: styles.h1 },
        `Portfolio — ${snapshot.owner}/${snapshot.repo}`,
      ),
      React.createElement(
        Text,
        { style: styles.metaLine },
        `Ref: ${snapshot.ref}    Commit: ${snapshot.commitSha}`,
      ),
      React.createElement(
        Text,
        { style: styles.intro },
        "Your learning memory for this imported repository — the single shareable view a hiring manager can open. Composed from M5 / M6 / M7 / M8 / M9 with two bounded Anthropic SDK calls for Q&A and résumé bullets.",
      ),
      // Sections in the fixed Portfolio Page order — same order as the
      // markdown bundle's combined `portfolio.md` (#182).
      renderArchitectureSection(memory.architectureExplanation),
      renderDivider("d1"),
      renderLearningMemoryTreeSection(memory.learningMemoryTree),
      renderDivider("d2"),
      renderInterviewQASection(memory.interviewQa),
      renderDivider("d3"),
      renderResumeBulletsSection(memory.resumeBullets),
      renderDivider("d4"),
      renderDebugStoriesSection(memory.debugStories),
    ),
  )
}

function renderDivider(key: string): React.ReactElement {
  return React.createElement(View, { key, style: styles.divider })
}

// ---------------------------------------------------------------------------
// Section renderers — one per artifact in the same order as the markdown
// bundle's combined `portfolio.md` (#182): architecture → memory tree → Q&A
// → bullets → debug stories.
// ---------------------------------------------------------------------------

function renderArchitectureSection(
  arch: ArchitectureExplanation,
): React.ReactElement {
  return React.createElement(
    View,
    { key: "architecture" },
    React.createElement(
      Text,
      { style: styles.h2 },
      "Architecture Explanation",
    ),
    React.createElement(Text, { style: styles.paragraph }, arch.intro),
    renderArchitectureSubsection(arch.stackSection, "arch-stack"),
    renderArchitectureSubsection(arch.architectureSection, "arch-layers"),
    renderArchitectureSubsection(arch.keyFlowsSection, "arch-flows"),
  )
}

function renderArchitectureSubsection(
  section: ArchitectureExplanationSection,
  key: string,
): React.ReactElement {
  return React.createElement(
    View,
    { key },
    React.createElement(Text, { style: styles.h3 }, section.heading),
    renderBodyBlock(section.body, `${key}-body`),
    section.citedFiles.length > 0
      ? renderCitedFiles(section.citedFiles, `${key}-cited`)
      : null,
  )
}

function renderBodyBlock(body: string, key: string): React.ReactElement {
  // The composer (#179) emits markdown-flavoured prose with `\n` breaks and
  // optional `- ` bullet lines. We render each non-empty line as a paragraph
  // and recognise leading `- ` as a bullet — no full markdown parser, just a
  // visible approximation of the markdown rendering for the PDF container.
  const lines = body.split("\n")
  const elements: React.ReactNode[] = []
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed === "") {
      return
    }
    if (trimmed.startsWith("- ")) {
      elements.push(
        renderBullet(trimmed.slice(2), `${key}-bullet-${index}`),
      )
      return
    }
    elements.push(
      React.createElement(
        Text,
        { key: `${key}-line-${index}`, style: styles.paragraph },
        line,
      ),
    )
  })
  return React.createElement(View, { key, style: styles.bodyBlock }, elements)
}

function renderBullet(text: string, key: string): React.ReactElement {
  return React.createElement(
    View,
    { key, style: styles.bullet },
    React.createElement(Text, { style: styles.bulletMark }, "-"),
    React.createElement(Text, { style: styles.bulletBody }, text),
  )
}

function renderCitedFiles(
  paths: string[],
  key: string,
): React.ReactElement {
  return React.createElement(
    View,
    { key },
    React.createElement(Text, { style: styles.citedLabel }, "Cited files"),
    ...paths.map((path, index) =>
      React.createElement(
        Text,
        { key: `${key}-${index}`, style: styles.monoLine },
        path,
      ),
    ),
  )
}

function renderLearningMemoryTreeSection(
  tree: LearningMemoryTree,
): React.ReactElement {
  const branchElements: React.ReactNode[] =
    tree.branches.length === 0
      ? [
          React.createElement(
            Text,
            { key: "tree-empty", style: styles.emptyNote },
            "No learned concepts available.",
          ),
        ]
      : tree.branches.map((branch, index) =>
          renderLearningMemoryBranch(branch, `tree-branch-${index}`),
        )
  const revisitElements: React.ReactNode[] =
    tree.stillToRevisit.length === 0
      ? [
          React.createElement(
            Text,
            { key: "revisit-empty", style: styles.emptyNote },
            "No weak areas currently flagged.",
          ),
        ]
      : tree.stillToRevisit.map((entry, index) =>
          renderRevisitEntry(entry, `revisit-${index}`),
        )
  return React.createElement(
    View,
    { key: "memory-tree" },
    React.createElement(Text, { style: styles.h2 }, "Learning Memory Tree"),
    React.createElement(
      Text,
      { style: styles.intro },
      "Things you now understand about this repository, and the M7 / M8 / M9 row that taught each one.",
    ),
    ...branchElements,
    React.createElement(Text, { style: styles.h3 }, "Still to revisit"),
    React.createElement(
      Text,
      { style: styles.intro },
      'Weak-area entries from your M7 / M8 / M9 grading — the honest "what to brush up on" view (PRD FR-4).',
    ),
    ...revisitElements,
  )
}

function renderLearningMemoryBranch(
  branch: LearningMemoryTreeBranch,
  key: string,
): React.ReactElement {
  const leaves: React.ReactNode[] =
    branch.leaves.length === 0
      ? [
          React.createElement(
            Text,
            { key: `${key}-empty`, style: styles.emptyNote },
            "No concepts in this branch.",
          ),
        ]
      : branch.leaves.map((leaf, index) =>
          renderLearningMemoryLeaf(leaf, `${key}-leaf-${index}`),
        )
  return React.createElement(
    View,
    { key },
    React.createElement(Text, { style: styles.h3 }, branch.heading),
    ...leaves,
  )
}

function renderLearningMemoryLeaf(
  leaf: LearningMemoryTreeLeaf,
  key: string,
): React.ReactElement {
  const locator = leaf.source.locator ? ` (${leaf.source.locator})` : ""
  const sourceLabel = `(source: ${leaf.source.milestone} #${leaf.source.rowId}${locator})`
  return renderBullet(
    `${leaf.concept} — ${leaf.detail} ${sourceLabel}`,
    key,
  )
}

function renderRevisitEntry(
  entry: LearningMemoryRevisitEntry,
  key: string,
): React.ReactElement {
  const sourceLabel = `(source: ${entry.source.milestone} #${entry.source.rowId})`
  return renderBullet(
    `${entry.area} — ${entry.detail} ${sourceLabel}`,
    key,
  )
}

function renderInterviewQASection(qa: InterviewQA[]): React.ReactElement {
  if (qa.length === 0) {
    return React.createElement(
      View,
      { key: "qa" },
      React.createElement(Text, { style: styles.h2 }, "Interview Q&A"),
      React.createElement(
        Text,
        { style: styles.intro },
        "Generated by a bounded Anthropic SDK call from your M5 / M6 / M7 / M8 / M9 rows; every answer cites a real file path or stack entry from your repo.",
      ),
      React.createElement(
        Text,
        { style: styles.emptyNote },
        "No interview Q&A available.",
      ),
    )
  }
  return React.createElement(
    View,
    { key: "qa" },
    React.createElement(Text, { style: styles.h2 }, "Interview Q&A"),
    React.createElement(
      Text,
      { style: styles.intro },
      "Generated by a bounded Anthropic SDK call from your M5 / M6 / M7 / M8 / M9 rows; every answer cites a real file path or stack entry from your repo.",
    ),
    ...qa.map((item, index) => renderQAEntry(item, `qa-${index}`)),
  )
}

function renderQAEntry(item: InterviewQA, key: string): React.ReactElement {
  return React.createElement(
    View,
    { key },
    React.createElement(Text, { style: styles.h3 }, `Q: ${item.question}`),
    React.createElement(
      Text,
      { style: styles.paragraph },
      `Ground area: ${item.groundArea}`,
    ),
    React.createElement(
      Text,
      { style: styles.paragraph },
      `A. ${item.answer}`,
    ),
    item.sourceReferences.length > 0
      ? renderCitedFiles(item.sourceReferences, `${key}-refs`)
      : null,
  )
}

function renderResumeBulletsSection(
  bullets: ResumeBullet[],
): React.ReactElement {
  if (bullets.length === 0) {
    return React.createElement(
      View,
      { key: "bullets" },
      React.createElement(Text, { style: styles.h2 }, "Résumé Bullets"),
      React.createElement(
        Text,
        { style: styles.intro },
        "Generated by a bounded Anthropic SDK call; ≤ 160 characters each, in industry-standard verb + outcome + technology form.",
      ),
      React.createElement(
        Text,
        { style: styles.emptyNote },
        "No résumé bullets available.",
      ),
    )
  }
  return React.createElement(
    View,
    { key: "bullets" },
    React.createElement(Text, { style: styles.h2 }, "Résumé Bullets"),
    React.createElement(
      Text,
      { style: styles.intro },
      "Generated by a bounded Anthropic SDK call; ≤ 160 characters each, in industry-standard verb + outcome + technology form.",
    ),
    ...bullets.map((bullet, index) =>
      renderBulletEntry(bullet, `bullet-${index}`),
    ),
  )
}

function renderBulletEntry(
  bullet: ResumeBullet,
  key: string,
): React.ReactElement {
  const techSuffix =
    bullet.technologies.length > 0
      ? ` (tech: ${bullet.technologies.join(", ")})`
      : ""
  const filesSuffix =
    bullet.sourceFiles.length > 0
      ? ` (grounded in: ${bullet.sourceFiles.join(", ")})`
      : ""
  return renderBullet(`${bullet.text}${techSuffix}${filesSuffix}`, key)
}

function renderDebugStoriesSection(stories: DebugStory[]): React.ReactElement {
  if (stories.length === 0) {
    return React.createElement(
      View,
      { key: "debug" },
      React.createElement(Text, { style: styles.h2 }, "Debug Stories"),
      React.createElement(
        Text,
        { style: styles.intro },
        "Composed deterministically from your M9 challenge attempts — what you tried, what you scored, and the feedback the grader gave.",
      ),
      React.createElement(
        Text,
        { style: styles.emptyNote },
        "No debug stories available.",
      ),
    )
  }
  return React.createElement(
    View,
    { key: "debug" },
    React.createElement(Text, { style: styles.h2 }, "Debug Stories"),
    React.createElement(
      Text,
      { style: styles.intro },
      "Composed deterministically from your M9 challenge attempts — what you tried, what you scored, and the feedback the grader gave.",
    ),
    ...stories.map((story, index) => renderDebugStory(story, `debug-${index}`)),
  )
}

function renderDebugStory(
  story: DebugStory,
  key: string,
): React.ReactElement {
  const passLabel = story.gradingResult.passed ? "passed" : "did not pass"
  const elements: React.ReactNode[] = [
    React.createElement(Text, { key: `${key}-type`, style: styles.h3 }, story.challengeType),
    React.createElement(
      Text,
      { key: `${key}-task`, style: styles.paragraph },
      `Task. ${story.taskSummary}`,
    ),
    React.createElement(
      Text,
      { key: `${key}-expl`, style: styles.paragraph },
      `Your explanation. ${story.explanationExcerpt}`,
    ),
    React.createElement(
      Text,
      { key: `${key}-grade`, style: styles.paragraph },
      `Grading. ${story.gradingResult.score}/100 — ${passLabel}.`,
    ),
  ]
  if (story.gradingResult.topWeakArea) {
    const wa = story.gradingResult.topWeakArea
    elements.push(
      React.createElement(
        Text,
        { key: `${key}-weak`, style: styles.paragraph },
        `Top weak area. ${wa.area} — ${wa.detail}`,
      ),
    )
  }
  return React.createElement(View, { key }, elements)
}
