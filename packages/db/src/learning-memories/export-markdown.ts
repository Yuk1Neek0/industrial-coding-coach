// Markdown bundle exporter for M10 Learning Memory & Portfolio Export
// (learning-memory-portfolio-export PRD US-5 / US-6, Issue #182).
//
// Renders a `learning_memories` row + its parent `repo_snapshots` row as six
// markdown files plus a combined `portfolio.md`, packaged as a downloadable
// ZIP. Pure-TypeScript rendering — no Anthropic SDK call, no clock read, no
// `Map` / `Set` iteration leaks — so re-running the renderer on the same
// `(memory, snapshot)` pair returns byte-identical files AND a byte-identical
// zip buffer (PRD NFR-2).
//
// The composers (#179, `compose.ts`) emit typed TS objects; the bounded SDK
// calls (#180, #181) emit typed `InterviewQA[]` / `ResumeBullet[]`. This file
// is the ONLY place those typed shapes are serialised to markdown — keeping
// the composers reusable for the Portfolio Page's React render too (#184).
//
// Bundle (filenames literal):
//   - architecture.md         — memory.architectureExplanation
//   - learning-memory-tree.md — memory.learningMemoryTree (with FR-4 weak-area
//                               branch surfaced as "Still to revisit")
//   - interview-qa.md         — memory.interviewQa (Q + A blocks)
//   - resume-bullets.md       — memory.resumeBullets (markdown bullet list)
//   - debug-stories.md        — memory.debugStories (one section per attempt)
//   - portfolio.md            — combined bundle in the fixed Portfolio-Page
//                               order: architecture → memory tree → Q&A →
//                               bullets → debug stories (page spec §6).
//
// ZIP filename: `portfolio-<slug(owner)>-<slug(repo)>-<snapshot.id>.zip`.
// `slug()` lowercases and replaces `/`, whitespace, and any filesystem-unsafe
// chars with `-` so the filename is safe on Windows, macOS, and Linux even
// when `owner` is `acme/sub` or `repo` has spaces (PRD US-6).

import { strToU8, zipSync } from "fflate"

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

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/**
 * The rendered markdown bundle. Both shapes are returned so the same renderer
 * powers the Portfolio Page's optional side-render of any individual file
 * (`files["architecture.md"]`) AND the Server Action's download path
 * (`zip` as a `Buffer`).
 */
export interface PortfolioMarkdownBundle {
  /** In-memory map from bundle filename to rendered markdown contents. */
  files: Record<string, string>
  /** ZIP bytes packing exactly the files above. */
  zip: Buffer
  /** Filename the Server Action should serve the download as. */
  zipFilename: string
}

/**
 * Render a learning memory + its snapshot as the six-file markdown bundle
 * plus a combined `portfolio.md`, packaged as a downloadable ZIP. Pure
 * TypeScript; reproducible byte-for-byte across calls on identical input
 * (PRD NFR-2).
 *
 * `async` to match the Server Action call site's shape; the renderer itself
 * is synchronous — no I/O, no clock, no randomness.
 */
export async function renderPortfolioMarkdownBundle(
  memory: LearningMemory,
  snapshot: RepoSnapshot,
): Promise<PortfolioMarkdownBundle> {
  const files = buildFileMap(memory, snapshot)
  const zipFilename = buildZipFilename(snapshot)
  const zip = buildZip(files)
  return { files, zip, zipFilename }
}

// ---------------------------------------------------------------------------
// File map builder — the literal ordered list of bundle entries
// ---------------------------------------------------------------------------

/** Filename used for each bundle entry. Order here is the bundle order. */
const FILE_ORDER = [
  "architecture.md",
  "learning-memory-tree.md",
  "interview-qa.md",
  "resume-bullets.md",
  "debug-stories.md",
  "portfolio.md",
] as const

function buildFileMap(
  memory: LearningMemory,
  snapshot: RepoSnapshot,
): Record<string, string> {
  // Render each per-type file from the typed memory fields.
  const architectureMd = renderArchitectureFile(memory.architectureExplanation)
  const treeMd = renderLearningMemoryTreeFile(memory.learningMemoryTree)
  const qaMd = renderInterviewQAFile(memory.interviewQa)
  const bulletsMd = renderResumeBulletsFile(memory.resumeBullets)
  const debugMd = renderDebugStoriesFile(memory.debugStories)
  // Combined portfolio.md follows the Portfolio Page's fixed section order
  // (page spec §6): architecture → memory tree → Q&A → bullets → debug.
  const portfolioMd = renderCombinedPortfolioFile(memory, snapshot)

  // Write keys in source order so iteration is deterministic — no
  // Object.keys() on a foreign object, no Map.
  const files: Record<string, string> = {}
  files["architecture.md"] = architectureMd
  files["learning-memory-tree.md"] = treeMd
  files["interview-qa.md"] = qaMd
  files["resume-bullets.md"] = bulletsMd
  files["debug-stories.md"] = debugMd
  files["portfolio.md"] = portfolioMd
  return files
}

// ---------------------------------------------------------------------------
// Filename helpers — slug + zip filename
// ---------------------------------------------------------------------------

/**
 * Lowercase + replace `/`, whitespace, and any filesystem-unsafe character
 * with `-`. Collapses runs of `-` and trims leading/trailing separators so
 * the filename is safe on Windows (no `< > : " / \ | ? *`), macOS, and Linux
 * (PRD US-6).
 */
function slug(value: string): string {
  const lowered = value.toLowerCase()
  // Replace any character outside [a-z0-9._-] (which includes `/`, spaces,
  // and the Windows-reserved set) with `-`.
  const replaced = lowered.replace(/[^a-z0-9._-]+/g, "-")
  // Collapse runs of `-` and trim leading/trailing `-` / `.`.
  const collapsed = replaced.replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "")
  return collapsed.length > 0 ? collapsed : "portfolio"
}

function buildZipFilename(snapshot: RepoSnapshot): string {
  return `portfolio-${slug(snapshot.owner)}-${slug(snapshot.repo)}-${snapshot.id}.zip`
}

// ---------------------------------------------------------------------------
// ZIP packer — fflate.zipSync, deterministic by construction
// ---------------------------------------------------------------------------

/**
 * Pack the in-memory file map into a ZIP buffer. Files are added in
 * `FILE_ORDER` so the zip's central-directory order is fixed across calls.
 * No `mtime` option is passed — fflate writes a fixed zero-mtime entry per
 * file, which makes the resulting bytes reproducible (NFR-2).
 */
function buildZip(files: Record<string, string>): Buffer {
  // Build a plain Zippable object whose keys are inserted in FILE_ORDER so
  // fflate walks them in that order — V8 preserves string-key insertion order
  // for non-array-index keys, which is what we rely on here.
  const zippable: Record<string, Uint8Array> = {}
  for (const name of FILE_ORDER) {
    const content = files[name]
    if (content === undefined) {
      // Defensive: every FILE_ORDER entry is set by buildFileMap above. If a
      // future edit drops one, fail loud here rather than emitting a silently
      // incomplete zip.
      throw new Error(`Bundle file map missing entry: ${name}`)
    }
    zippable[name] = strToU8(content)
  }
  const bytes = zipSync(zippable)
  return Buffer.from(bytes)
}

// ---------------------------------------------------------------------------
// Per-file renderers
//
// Convention: every sub-renderer returns a "block" — a `\n`-joined string with
// NO trailing newline. The top-level file renderers concatenate blocks with
// blank separators and call `finalize()` to append the single trailing newline
// at the file boundary. That keeps the rendered output exactly predictable and
// avoids accumulating stray blank lines when blocks compose.
// ---------------------------------------------------------------------------

/** Render `memory.architectureExplanation` as `architecture.md`. */
function renderArchitectureFile(arch: ArchitectureExplanation): string {
  const blocks: string[] = []
  blocks.push("# Architecture Explanation")
  blocks.push(arch.intro)
  blocks.push(renderArchitectureSection(arch.stackSection))
  blocks.push(renderArchitectureSection(arch.architectureSection))
  blocks.push(renderArchitectureSection(arch.keyFlowsSection))
  return finalize(blocks)
}

function renderArchitectureSection(
  section: ArchitectureExplanationSection,
): string {
  const lines: string[] = []
  lines.push(`## ${section.heading}`)
  lines.push("")
  lines.push(section.body)
  if (section.citedFiles.length > 0) {
    lines.push("")
    lines.push("**Cited files**")
    lines.push("")
    for (const path of section.citedFiles) {
      lines.push(`- \`${path}\``)
    }
  }
  return lines.join("\n")
}

/** Render `memory.learningMemoryTree` as `learning-memory-tree.md`. */
function renderLearningMemoryTreeFile(tree: LearningMemoryTree): string {
  const blocks: string[] = []
  blocks.push("# Learning Memory Tree")
  blocks.push(
    "Things you now understand about this repository, and the M7 / M8 / M9 row that taught each one.",
  )

  if (tree.branches.length === 0) {
    blocks.push("No learned concepts available.")
  } else {
    for (const branch of tree.branches) {
      blocks.push(renderLearningMemoryBranch(branch))
    }
  }

  // The "Still to revisit" header + intro + entries form one composed block so
  // the file-level separator handling stays consistent.
  const revisitLines: string[] = []
  revisitLines.push("## Still to revisit")
  revisitLines.push("")
  revisitLines.push(
    "Weak-area entries from your M7 / M8 / M9 grading — the honest \"what to brush up on\" view (PRD FR-4).",
  )
  revisitLines.push("")
  if (tree.stillToRevisit.length === 0) {
    revisitLines.push("No weak areas currently flagged.")
  } else {
    for (const entry of tree.stillToRevisit) {
      revisitLines.push(renderRevisitEntry(entry))
    }
  }
  blocks.push(revisitLines.join("\n"))
  return finalize(blocks)
}

function renderLearningMemoryBranch(branch: LearningMemoryTreeBranch): string {
  const lines: string[] = []
  lines.push(`## ${branch.heading}`)
  lines.push("")
  if (branch.leaves.length === 0) {
    lines.push("_No concepts in this branch._")
    return lines.join("\n")
  }
  for (const leaf of branch.leaves) {
    lines.push(renderLearningMemoryLeaf(leaf))
  }
  return lines.join("\n")
}

function renderLearningMemoryLeaf(leaf: LearningMemoryTreeLeaf): string {
  const locator = leaf.source.locator ? ` (${leaf.source.locator})` : ""
  return `- **${leaf.concept}** — ${leaf.detail} _(source: ${leaf.source.milestone} #${leaf.source.rowId}${locator})_`
}

function renderRevisitEntry(entry: LearningMemoryRevisitEntry): string {
  return `- **${entry.area}** — ${entry.detail} _(source: ${entry.source.milestone} #${entry.source.rowId})_`
}

/** Render `memory.interviewQa` as `interview-qa.md`. */
function renderInterviewQAFile(qa: InterviewQA[]): string {
  const blocks: string[] = []
  blocks.push("# Interview Q&A")
  blocks.push(
    "Generated by a bounded Anthropic SDK call from your M5 / M6 / M7 / M8 / M9 rows; every answer cites a real file path or stack entry from your repo.",
  )
  if (qa.length === 0) {
    blocks.push("No interview Q&A available.")
    return finalize(blocks)
  }
  for (const item of qa) {
    blocks.push(renderQAEntry(item))
  }
  return finalize(blocks)
}

function renderQAEntry(item: InterviewQA): string {
  const lines: string[] = []
  lines.push(`## Q: ${item.question}`)
  lines.push("")
  lines.push(`**Ground area:** ${item.groundArea}`)
  lines.push("")
  lines.push("**A.** " + item.answer)
  if (item.sourceReferences.length > 0) {
    lines.push("")
    lines.push("**Source references**")
    lines.push("")
    for (const ref of item.sourceReferences) {
      lines.push(`- \`${ref}\``)
    }
  }
  return lines.join("\n")
}

/** Render `memory.resumeBullets` as `resume-bullets.md`. */
function renderResumeBulletsFile(bullets: ResumeBullet[]): string {
  const blocks: string[] = []
  blocks.push("# Résumé Bullets")
  blocks.push(
    "Generated by a bounded Anthropic SDK call; ≤ 160 characters each, in industry-standard verb + outcome + technology form.",
  )
  if (bullets.length === 0) {
    blocks.push("No résumé bullets available.")
    return finalize(blocks)
  }
  // The bullet list itself is one block — a `\n`-joined sequence of list items
  // with no blank-line separators between bullets.
  blocks.push(bullets.map(renderBulletEntry).join("\n"))
  return finalize(blocks)
}

function renderBulletEntry(bullet: ResumeBullet): string {
  const tech =
    bullet.technologies.length > 0
      ? ` _(tech: ${bullet.technologies.join(", ")})_`
      : ""
  const files =
    bullet.sourceFiles.length > 0
      ? ` _(grounded in: ${bullet.sourceFiles
          .map((p) => `\`${p}\``)
          .join(", ")})_`
      : ""
  return `- ${bullet.text}${tech}${files}`
}

/** Render `memory.debugStories` as `debug-stories.md`. */
function renderDebugStoriesFile(stories: DebugStory[]): string {
  const blocks: string[] = []
  blocks.push("# Debug Stories")
  blocks.push(
    "Composed deterministically from your M9 challenge attempts — what you tried, what you scored, and the feedback the grader gave.",
  )
  if (stories.length === 0) {
    blocks.push("No debug stories available.")
    return finalize(blocks)
  }
  for (const story of stories) {
    blocks.push(renderDebugStory(story))
  }
  return finalize(blocks)
}

function renderDebugStory(story: DebugStory): string {
  const lines: string[] = []
  lines.push(`## ${story.challengeType}`)
  lines.push("")
  lines.push(`**Task.** ${story.taskSummary}`)
  lines.push("")
  lines.push(`**Your explanation.** ${story.explanationExcerpt}`)
  lines.push("")
  const passLabel = story.gradingResult.passed ? "passed" : "did not pass"
  lines.push(
    `**Grading.** ${story.gradingResult.score}/100 — ${passLabel}.`,
  )
  if (story.gradingResult.topWeakArea) {
    const wa = story.gradingResult.topWeakArea
    lines.push("")
    lines.push(`**Top weak area.** ${wa.area} — ${wa.detail}`)
  }
  return lines.join("\n")
}

/**
 * Render the combined `portfolio.md` — the full bundle in the Portfolio
 * Page's fixed section order (page spec §6): architecture → memory tree →
 * Q&A → bullets → debug stories.
 *
 * Each per-type file is reused verbatim and separated by a horizontal-rule
 * block so the combined file reads as one continuous document.
 */
function renderCombinedPortfolioFile(
  memory: LearningMemory,
  snapshot: RepoSnapshot,
): string {
  const blocks: string[] = []
  blocks.push(`# Portfolio — ${snapshot.owner}/${snapshot.repo}`)
  blocks.push(`Ref: \`${snapshot.ref}\` · Commit: \`${snapshot.commitSha}\``)
  blocks.push(
    "Your learning memory for this imported repository — the single shareable view a hiring manager can open. Composed from M5 / M6 / M7 / M8 / M9 with two bounded Anthropic SDK calls for Q&A and résumé bullets.",
  )
  // The per-file renderers already emit a trailing newline (`finalize`)
  // because they are file-level outputs in their own right. For the combined
  // file we strip that trailing `\n` before joining so the block-separator
  // logic in `finalize()` produces exactly one blank line between sections.
  const append = (full: string) =>
    full.endsWith("\n") ? full.slice(0, -1) : full
  blocks.push("---")
  blocks.push(append(renderArchitectureFile(memory.architectureExplanation)))
  blocks.push("---")
  blocks.push(append(renderLearningMemoryTreeFile(memory.learningMemoryTree)))
  blocks.push("---")
  blocks.push(append(renderInterviewQAFile(memory.interviewQa)))
  blocks.push("---")
  blocks.push(append(renderResumeBulletsFile(memory.resumeBullets)))
  blocks.push("---")
  blocks.push(append(renderDebugStoriesFile(memory.debugStories)))
  return finalize(blocks)
}

// ---------------------------------------------------------------------------
// Tiny string helpers
// ---------------------------------------------------------------------------

/**
 * Compose a list of "blocks" (each block is a `\n`-joined string with NO
 * trailing newline) into a single file: blocks are separated by exactly one
 * blank line, the file ends with a single trailing newline, and embedded
 * blank lines inside blocks are preserved as-is.
 */
function finalize(blocks: string[]): string {
  return `${blocks.join("\n\n")}\n`
}
