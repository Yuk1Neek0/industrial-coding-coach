// Tests for the M10 markdown bundle exporter (Issue #182).
//
// The exporter is a pure-TS renderer over typed `LearningMemory` +
// `RepoSnapshot` objects (no I/O, no clock, no SDK). Tests cover:
//
//   1. Golden-file comparison — each of the six rendered files matches an
//      inline expected string (mirrors M9's golden-file pattern).
//   2. ZIP unpack round-trip — `fflate.unzipSync` on the returned zip buffer
//      yields the same six files byte-for-byte.
//   3. Reproducibility (NFR-2) — two calls on identical input produce
//      byte-identical `files` AND byte-identical zip buffers.
//   4. Slug safety — `owner` / `repo` containing `/`, spaces, or other
//      filesystem-unsafe chars yields a Windows-/macOS-/Linux-safe zip
//      filename (PRD US-6).
//   5. Empty-but-valid memory — empty `interviewQa[]`, empty
//      `learningMemoryTree.branches`, empty `debugStories[]` (within a
//      non-null memory row) each render an explicit "No <X> available."
//      line; the renderer does not crash.

import Database from "better-sqlite3"
import { strFromU8, unzipSync } from "fflate"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import {
  type ArchitectureExplanation,
  type DebugStory,
  type InterviewQA,
  type LearningMemory,
  type LearningMemoryTree,
  type NewRepoSnapshot,
  type RepoSnapshot,
  type ResumeBullet,
  repoSnapshots,
} from "../schema"
import * as schema from "../schema"
import { createMemory, type LearningMemoryContent } from "./memories"
import { renderPortfolioMarkdownBundle } from "./export-markdown"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "drizzle",
)

/** A fresh in-memory catalog DB with the real migrations applied. */
function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db
}

// ---------------------------------------------------------------------------
// Fixtures — typed `LearningMemory` + `RepoSnapshot` literals
// ---------------------------------------------------------------------------

const snapshotInsert: NewRepoSnapshot = {
  owner: "acme",
  repo: "portfolio",
  ref: "main",
  commitSha: "deadbeef",
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/portfolio",
  fileTree: [
    { path: "apps/web/app/page.tsx", type: "blob", sha: "a", size: 200 },
    { path: "packages/db/src/schema.ts", type: "blob", sha: "b", size: 300 },
  ],
}

const richArchitecture: ArchitectureExplanation = {
  intro: "A local-first Next.js coach for AI-assisted projects.",
  stackSection: {
    heading: "Stack & tooling",
    body: "- Next.js: Renders the app's routes.\n- Drizzle ORM: Types the local SQLite catalog.",
    citedFiles: ["packages/db/src/schema.ts"],
  },
  architectureSection: {
    heading: "Architectural layers",
    body: "- Frontend: Next.js App Router under apps/web/.\n- Data layer: Drizzle ORM over SQLite.",
    citedFiles: ["apps/web/app/page.tsx"],
  },
  keyFlowsSection: {
    heading: "Key flows",
    body: "**Request / data flow**\n1. Browser requests /\n2. Server action loads data",
    citedFiles: ["apps/web/app/page.tsx"],
  },
}

const richTree: LearningMemoryTree = {
  branches: [
    {
      heading: "From learning units",
      leaves: [
        {
          concept: "Server Actions",
          detail: "Next.js App Router server-side procedures.",
          source: { milestone: "M7", rowId: 1, locator: "#42" },
        },
      ],
    },
  ],
  stillToRevisit: [
    {
      area: "data-flow",
      detail: "Couldn't explain why the action ran twice.",
      source: { milestone: "M7", rowId: 1 },
    },
  ],
}

const richQA: InterviewQA[] = [
  {
    question: "Why does the project use Next.js?",
    answer:
      "Next.js App Router fits the per-route Server Action surface this project ships.",
    groundArea: "stack",
    sourceReferences: ["apps/web/app/page.tsx"],
  },
]

const richBullets: ResumeBullet[] = [
  {
    text: "Built a learning-coach app with Next.js Server Actions and Drizzle ORM",
    technologies: ["Next.js", "Drizzle ORM"],
    sourceFiles: ["apps/web/app/page.tsx", "packages/db/src/schema.ts"],
  },
]

const richDebug: DebugStory[] = [
  {
    challengeType: "trace-failed-api-call",
    taskSummary: "Trace why /health returned 500 on cold-start.",
    explanationExcerpt:
      "The Server Action threw before responding because the DB client wasn't initialised on cold-start.",
    gradingResult: {
      score: 78,
      passed: true,
      topWeakArea: {
        area: "error-handling",
        detail: "Did not name the lazy-init source.",
      },
    },
  },
]

const richContent: LearningMemoryContent = {
  interviewQa: richQA,
  resumeBullets: richBullets,
  architectureExplanation: richArchitecture,
  learningMemoryTree: richTree,
  debugStories: richDebug,
}

/** Build a richly-seeded learning memory + snapshot via the real DAL. */
async function seedRichMemory(): Promise<{
  memory: LearningMemory
  snapshot: RepoSnapshot
}> {
  const db = makeTestDb()
  const snapshot = db
    .insert(repoSnapshots)
    .values(snapshotInsert)
    .returning()
    .get()
  const memory = await createMemory(snapshot.id, richContent, db)
  return { memory, snapshot }
}

/**
 * Build a `LearningMemory`-shaped literal directly (no DB round-trip),
 * pinning the volatile id / timestamp fields to fixed values so golden-file
 * assertions remain stable. The renderer doesn't read those fields, but
 * they are required by the typed shape.
 */
function makeFixedMemory(
  overrides: Partial<LearningMemoryContent> = {},
): { memory: LearningMemory; snapshot: RepoSnapshot } {
  const fixedDate = new Date("2026-05-27T00:00:00Z")
  const snapshot: RepoSnapshot = {
    id: 7,
    owner: "acme",
    repo: "portfolio",
    ref: "main",
    commitSha: "deadbeef",
    defaultBranch: "main",
    description: null,
    primaryLanguage: null,
    isPrivate: false,
    htmlUrl: "https://github.com/acme/portfolio",
    fileTree: snapshotInsert.fileTree,
    importedAt: fixedDate,
    createdAt: fixedDate,
    updatedAt: fixedDate,
  }
  const memory: LearningMemory = {
    id: 1,
    snapshotId: snapshot.id,
    interviewQa: overrides.interviewQa ?? richQA,
    resumeBullets: overrides.resumeBullets ?? richBullets,
    architectureExplanation:
      overrides.architectureExplanation ?? richArchitecture,
    learningMemoryTree: overrides.learningMemoryTree ?? richTree,
    debugStories: overrides.debugStories ?? richDebug,
    generatedAt: fixedDate,
    createdAt: fixedDate,
    updatedAt: fixedDate,
  }
  return { memory, snapshot }
}

// ---------------------------------------------------------------------------
// 1. Golden-file comparison — each rendered file matches an inline expected
// ---------------------------------------------------------------------------

describe("renderPortfolioMarkdownBundle — golden file comparison", () => {
  it("architecture.md renders intro + three sections with cited files", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const { files } = await renderPortfolioMarkdownBundle(memory, snapshot)
    const expected = [
      "# Architecture Explanation",
      "",
      "A local-first Next.js coach for AI-assisted projects.",
      "",
      "## Stack & tooling",
      "",
      "- Next.js: Renders the app's routes.",
      "- Drizzle ORM: Types the local SQLite catalog.",
      "",
      "**Cited files**",
      "",
      "- `packages/db/src/schema.ts`",
      "",
      "## Architectural layers",
      "",
      "- Frontend: Next.js App Router under apps/web/.",
      "- Data layer: Drizzle ORM over SQLite.",
      "",
      "**Cited files**",
      "",
      "- `apps/web/app/page.tsx`",
      "",
      "## Key flows",
      "",
      "**Request / data flow**",
      "1. Browser requests /",
      "2. Server action loads data",
      "",
      "**Cited files**",
      "",
      "- `apps/web/app/page.tsx`",
      "",
    ].join("\n")
    expect(files["architecture.md"]).toBe(expected)
  })

  it("learning-memory-tree.md renders branches + 'Still to revisit'", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const { files } = await renderPortfolioMarkdownBundle(memory, snapshot)
    const expected = [
      "# Learning Memory Tree",
      "",
      "Things you now understand about this repository, and the M7 / M8 / M9 row that taught each one.",
      "",
      "## From learning units",
      "",
      "- **Server Actions** — Next.js App Router server-side procedures. _(source: M7 #1 (#42))_",
      "",
      "## Still to revisit",
      "",
      "Weak-area entries from your M7 / M8 / M9 grading — the honest \"what to brush up on\" view (PRD FR-4).",
      "",
      "- **data-flow** — Couldn't explain why the action ran twice. _(source: M7 #1)_",
      "",
    ].join("\n")
    expect(files["learning-memory-tree.md"]).toBe(expected)
  })

  it("interview-qa.md renders Q + A blocks", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const { files } = await renderPortfolioMarkdownBundle(memory, snapshot)
    const expected = [
      "# Interview Q&A",
      "",
      "Generated by a bounded Anthropic SDK call from your M5 / M6 / M7 / M8 / M9 rows; every answer cites a real file path or stack entry from your repo.",
      "",
      "## Q: Why does the project use Next.js?",
      "",
      "**Ground area:** stack",
      "",
      "**A.** Next.js App Router fits the per-route Server Action surface this project ships.",
      "",
      "**Source references**",
      "",
      "- `apps/web/app/page.tsx`",
      "",
    ].join("\n")
    expect(files["interview-qa.md"]).toBe(expected)
  })

  it("resume-bullets.md renders a markdown bullet list", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const { files } = await renderPortfolioMarkdownBundle(memory, snapshot)
    const expected = [
      "# Résumé Bullets",
      "",
      "Generated by a bounded Anthropic SDK call; ≤ 160 characters each, in industry-standard verb + outcome + technology form.",
      "",
      "- Built a learning-coach app with Next.js Server Actions and Drizzle ORM _(tech: Next.js, Drizzle ORM)_ _(grounded in: `apps/web/app/page.tsx`, `packages/db/src/schema.ts`)_",
      "",
    ].join("\n")
    expect(files["resume-bullets.md"]).toBe(expected)
  })

  it("debug-stories.md renders one section per attempt", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const { files } = await renderPortfolioMarkdownBundle(memory, snapshot)
    const expected = [
      "# Debug Stories",
      "",
      "Composed deterministically from your M9 challenge attempts — what you tried, what you scored, and the feedback the grader gave.",
      "",
      "## trace-failed-api-call",
      "",
      "**Task.** Trace why /health returned 500 on cold-start.",
      "",
      "**Your explanation.** The Server Action threw before responding because the DB client wasn't initialised on cold-start.",
      "",
      "**Grading.** 78/100 — passed.",
      "",
      "**Top weak area.** error-handling — Did not name the lazy-init source.",
      "",
    ].join("\n")
    expect(files["debug-stories.md"]).toBe(expected)
  })

  it("portfolio.md combines all five sections in the fixed page order", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const { files } = await renderPortfolioMarkdownBundle(memory, snapshot)
    const combined = files["portfolio.md"]!
    // The combined file leads with the repo header + ref/commit line + intro,
    // then the five sections in the Portfolio Page's fixed order separated by
    // `---` rules.
    expect(combined.startsWith("# Portfolio — acme/portfolio\n")).toBe(true)
    expect(combined).toContain("Ref: `main` · Commit: `deadbeef`")

    // Section headings appear in the fixed order.
    const archIdx = combined.indexOf("# Architecture Explanation")
    const treeIdx = combined.indexOf("# Learning Memory Tree")
    const qaIdx = combined.indexOf("# Interview Q&A")
    const bulletsIdx = combined.indexOf("# Résumé Bullets")
    const debugIdx = combined.indexOf("# Debug Stories")
    expect(archIdx).toBeGreaterThan(-1)
    expect(treeIdx).toBeGreaterThan(archIdx)
    expect(qaIdx).toBeGreaterThan(treeIdx)
    expect(bulletsIdx).toBeGreaterThan(qaIdx)
    expect(debugIdx).toBeGreaterThan(bulletsIdx)

    // Cited prose is carried through to the combined file.
    expect(combined).toContain("Server Actions")
    expect(combined).toContain("Still to revisit")
    expect(combined).toContain("Built a learning-coach app")
    expect(combined).toContain("trace-failed-api-call")
  })

  it("exposes exactly the six bundle filenames in the file map", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const { files } = await renderPortfolioMarkdownBundle(memory, snapshot)
    expect(Object.keys(files)).toEqual([
      "architecture.md",
      "learning-memory-tree.md",
      "interview-qa.md",
      "resume-bullets.md",
      "debug-stories.md",
      "portfolio.md",
    ])
  })

  it("renders correctly from a memory round-tripped through the DAL", async () => {
    const { memory, snapshot } = await seedRichMemory()
    const { files } = await renderPortfolioMarkdownBundle(memory, snapshot)
    // Each per-type file leads with its title — DAL round-trip preserves the
    // JSON columns byte-for-byte through the typed contract.
    expect(files["architecture.md"]?.startsWith("# Architecture Explanation"))
      .toBe(true)
    expect(files["learning-memory-tree.md"]?.startsWith("# Learning Memory Tree"))
      .toBe(true)
    expect(files["interview-qa.md"]?.startsWith("# Interview Q&A")).toBe(true)
    expect(files["resume-bullets.md"]?.startsWith("# Résumé Bullets")).toBe(
      true,
    )
    expect(files["debug-stories.md"]?.startsWith("# Debug Stories")).toBe(true)
    expect(files["portfolio.md"]?.includes(`acme/portfolio`)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. ZIP unpack round-trip — fflate.unzipSync yields the same six files
// ---------------------------------------------------------------------------

describe("renderPortfolioMarkdownBundle — ZIP unpack round-trip", () => {
  it(
    "unzipSync on the returned zip buffer yields the six bundle files with " +
      "byte-identical contents to the in-memory file map",
    async () => {
      const { memory, snapshot } = makeFixedMemory()
      const { files, zip } = await renderPortfolioMarkdownBundle(
        memory,
        snapshot,
      )
      const unzipped = unzipSync(new Uint8Array(zip))
      const unzippedNames = Object.keys(unzipped).sort()
      const expectedNames = Object.keys(files).sort()
      expect(unzippedNames).toEqual(expectedNames)
      for (const name of expectedNames) {
        const bytes = unzipped[name]
        expect(bytes).toBeDefined()
        expect(strFromU8(bytes!)).toBe(files[name])
      }
    },
  )
})

// ---------------------------------------------------------------------------
// 3. Reproducibility (NFR-2) — two calls produce byte-identical output
// ---------------------------------------------------------------------------

describe("renderPortfolioMarkdownBundle — reproducibility (NFR-2)", () => {
  it("two calls on identical input produce byte-identical files AND zip", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const a = await renderPortfolioMarkdownBundle(memory, snapshot)
    const b = await renderPortfolioMarkdownBundle(memory, snapshot)
    expect(JSON.stringify(a.files)).toBe(JSON.stringify(b.files))
    expect(Buffer.compare(a.zip, b.zip)).toBe(0)
    expect(a.zipFilename).toBe(b.zipFilename)
  })
})

// ---------------------------------------------------------------------------
// 4. Slug safety — owner/repo with `/`, spaces, unsafe chars
// ---------------------------------------------------------------------------

describe("renderPortfolioMarkdownBundle — slug safety (PRD US-6)", () => {
  it(
    "owner containing `/` and spaces produces a filesystem-safe zip filename",
    async () => {
      const { memory, snapshot } = makeFixedMemory()
      const unsafeSnapshot: RepoSnapshot = {
        ...snapshot,
        owner: "Acme / Sub Org",
        repo: "My Portfolio?",
      }
      const { zipFilename } = await renderPortfolioMarkdownBundle(
        memory,
        unsafeSnapshot,
      )
      // No filesystem-unsafe characters in the resulting filename.
      expect(zipFilename).not.toMatch(/[/\\<>:"|?*\s]/)
      // Lowercased and slug-collapsed.
      expect(zipFilename).toBe("portfolio-acme-sub-org-my-portfolio-7.zip")
    },
  )

  it("owner / repo that slug to empty fall back to 'portfolio'", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const allUnsafeSnapshot: RepoSnapshot = {
      ...snapshot,
      owner: "////",
      repo: "    ",
    }
    const { zipFilename } = await renderPortfolioMarkdownBundle(
      memory,
      allUnsafeSnapshot,
    )
    expect(zipFilename).toBe("portfolio-portfolio-portfolio-7.zip")
  })
})

// ---------------------------------------------------------------------------
// 5. Empty-but-valid memory — explicit "No <X> available." lines
// ---------------------------------------------------------------------------

describe("renderPortfolioMarkdownBundle — empty-but-valid memory", () => {
  it(
    "empty interviewQa[], empty learningMemoryTree.branches, empty " +
      "debugStories[] each render an explicit 'No <X> available.' line " +
      "without crashing",
    async () => {
      const { memory, snapshot } = makeFixedMemory({
        interviewQa: [],
        resumeBullets: [],
        debugStories: [],
        learningMemoryTree: { branches: [], stillToRevisit: [] },
      })
      const { files, zip } = await renderPortfolioMarkdownBundle(
        memory,
        snapshot,
      )

      // Each section emits its empty-line copy verbatim.
      expect(files["interview-qa.md"]).toContain("No interview Q&A available.")
      expect(files["resume-bullets.md"]).toContain(
        "No résumé bullets available.",
      )
      expect(files["debug-stories.md"]).toContain("No debug stories available.")
      // Tree degrades into the no-concepts + no-weak-areas pair.
      expect(files["learning-memory-tree.md"]).toContain(
        "No learned concepts available.",
      )
      expect(files["learning-memory-tree.md"]).toContain(
        "No weak areas currently flagged.",
      )

      // Zip still packs the six files for an empty-but-valid memory.
      const unzipped = unzipSync(new Uint8Array(zip))
      expect(Object.keys(unzipped).sort()).toEqual(
        [...Object.keys(files)].sort(),
      )
    },
  )
})
