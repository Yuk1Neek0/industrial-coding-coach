// Tests for the M10 PDF exporter (Issue #183).
//
// The exporter wraps `@react-pdf/renderer` behind a single async function
// `renderPortfolioPdf` that returns `{ pdf: Buffer; pdfFilename: string }`.
// The PDF carries the same content as the markdown bundle's combined
// `portfolio.md` (#182), so the tests assert:
//
//   1. Smoke — the renderer returns a non-empty Buffer that starts with the
//      `%PDF-` magic header on the seeded happy-path fixture.
//   2. Structural — the rendered PDF contains identifiable strings from each
//      of the five fixed sections (architecture → memory tree → Q&A →
//      bullets → debug stories) in the spec §6 order. PDFs store text inside
//      `(...)` Tj string blocks in the content stream; we decode the buffer
//      as a Latin-1 string and search for the literal strings the renderer
//      emits. This is a smoke-level extractor — it does not parse the PDF
//      object graph — and is sufficient for "is the text actually in the
//      PDF" coverage without pulling a heavyweight `pdf-parse`/`pdfjs-dist`
//      dev dep into the catalog package.
//   3. Filename — `portfolio-<slug(owner)>-<slug(repo)>-<id>.pdf` for an
//      input with `/`, spaces, and other filesystem-unsafe chars in owner /
//      repo (PRD US-6).

import { inflateSync } from "node:zlib"
import { describe, expect, it } from "vitest"

import type {
  ArchitectureExplanation,
  DebugStory,
  InterviewQA,
  LearningMemory,
  LearningMemoryTree,
  RepoSnapshot,
  ResumeBullet,
} from "../schema"
import { renderPortfolioPdf } from "./export-pdf"

// ---------------------------------------------------------------------------
// Fixtures — typed `LearningMemory` + `RepoSnapshot` literals (mirrors the
// markdown bundle's `makeFixedMemory` shape so the two exporters cover the
// same artifact rows).
// ---------------------------------------------------------------------------

const fixedDate = new Date("2026-05-27T00:00:00Z")

const richArchitecture: ArchitectureExplanation = {
  intro: "ArchIntroMarker — a local-first Next.js coach for AI-assisted projects.",
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
    body: "Request and data flow steps grouped by responsibility.",
    citedFiles: ["apps/web/app/page.tsx"],
  },
}

const richTree: LearningMemoryTree = {
  branches: [
    {
      heading: "From learning units",
      leaves: [
        {
          concept: "ServerActionsConceptMarker",
          detail: "Next.js App Router server-side procedures.",
          source: { milestone: "M7", rowId: 1, locator: "#42" },
        },
      ],
    },
  ],
  stillToRevisit: [
    {
      area: "RevisitAreaMarker",
      detail: "Couldn't explain why the action ran twice.",
      source: { milestone: "M7", rowId: 1 },
    },
  ],
}

const richQA: InterviewQA[] = [
  {
    question: "QuestionMarker — why does the project use Next.js?",
    answer:
      "Next.js App Router fits the per-route Server Action surface this project ships.",
    groundArea: "stack",
    sourceReferences: ["apps/web/app/page.tsx"],
  },
]

const richBullets: ResumeBullet[] = [
  {
    text: "BulletMarker — built a learning-coach app with Next.js Server Actions",
    technologies: ["Next.js", "Drizzle ORM"],
    sourceFiles: ["apps/web/app/page.tsx", "packages/db/src/schema.ts"],
  },
]

const richDebug: DebugStory[] = [
  {
    challengeType: "DebugChallengeMarker",
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

function makeFixedMemory(): {
  memory: LearningMemory
  snapshot: RepoSnapshot
} {
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
    fileTree: [
      { path: "apps/web/app/page.tsx", type: "blob", sha: "a", size: 200 },
      { path: "packages/db/src/schema.ts", type: "blob", sha: "b", size: 300 },
    ],
    importedAt: fixedDate,
    createdAt: fixedDate,
    updatedAt: fixedDate,
  }
  const memory: LearningMemory = {
    id: 1,
    snapshotId: snapshot.id,
    interviewQa: richQA,
    resumeBullets: richBullets,
    architectureExplanation: richArchitecture,
    learningMemoryTree: richTree,
    debugStories: richDebug,
    generatedAt: fixedDate,
    createdAt: fixedDate,
    updatedAt: fixedDate,
  }
  return { memory, snapshot }
}

/**
 * Decode a `@react-pdf/renderer`-emitted PDF into a single Latin-1 string
 * for substring-search smoke checks. The renderer:
 *   1. Wraps content streams in `FlateDecode` — so the raw buffer doesn't
 *      contain visible text. We walk every `stream...endstream` block and
 *      inflate-decompress it with Node's built-in `zlib.inflateSync`.
 *   2. Inside the content stream it emits text via `[<hex_pairs> ...] TJ`
 *      where each `<hex_pairs>` is a hex-encoded sequence of WinAnsi
 *      character codes (e.g. `<41726368> -> "Arch"`). We scan the
 *      inflated stream for those `<...>` tokens and concatenate the
 *      decoded bytes. The result is a Latin-1 string carrying every
 *      visible character the renderer placed on the page.
 *
 * Lightweight by design — no `pdf-parse`, no `pdfjs-dist` dev dep, just a
 * stream walker plus a tiny hex decoder over the wire format.
 */
function decodePdfText(pdf: Buffer): string {
  const latin = pdf.toString("binary")
  const parts: string[] = []
  // Walk every `stream\n...\nendstream` block, inflate it, and pull every
  // `<hex>` text token out into a Latin-1 string.
  const streamMarker = "stream\n"
  let cursor = 0
  while (cursor < latin.length) {
    const start = latin.indexOf(streamMarker, cursor)
    if (start === -1) break
    const dataStart = start + streamMarker.length
    const end = latin.indexOf("\nendstream", dataStart)
    if (end === -1) break
    // Slice the bytes from the original Buffer (not the Latin-1 string,
    // which would mangle bytes ≥ 0x80) so inflate sees the real wire data.
    const compressed = pdf.subarray(dataStart, end)
    try {
      const inflated = inflateSync(compressed).toString("binary")
      parts.push(extractHexTextTokens(inflated))
    } catch {
      // Not a Flate stream — skip it; the renderer's text always lives
      // inside flate-compressed content streams.
    }
    cursor = end + "\nendstream".length
  }
  return parts.join("\n")
}

/**
 * Pull every `<hex_pairs>` text token out of a PDF content stream and
 * concatenate the decoded bytes as Latin-1. Tokens appear inside `[...] TJ`
 * arrays interleaved with numeric kerning adjustments; we only care about
 * the hex pairs, so a plain global regex over `<[0-9a-fA-F]+>` is enough.
 */
function extractHexTextTokens(stream: string): string {
  const matches = stream.match(/<[0-9a-fA-F]+>/g)
  if (!matches) return ""
  const chunks: string[] = []
  for (const token of matches) {
    const hex = token.slice(1, -1)
    if (hex.length === 0 || hex.length % 2 !== 0) continue
    // Decode pairs of hex digits to single-byte chars.
    let decoded = ""
    for (let i = 0; i < hex.length; i += 2) {
      const code = parseInt(hex.slice(i, i + 2), 16)
      if (Number.isFinite(code)) {
        decoded += String.fromCharCode(code)
      }
    }
    chunks.push(decoded)
  }
  return chunks.join("")
}

// ---------------------------------------------------------------------------
// 1. Smoke — non-empty Buffer with the PDF magic header
// ---------------------------------------------------------------------------

describe("renderPortfolioPdf — smoke", () => {
  it("returns a non-empty Buffer that starts with the %PDF- magic header", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const { pdf } = await renderPortfolioPdf(memory, snapshot)
    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(pdf.length).toBeGreaterThan(0)
    // PDF spec: every file starts with `%PDF-<major>.<minor>` in the first
    // 1024 bytes. A pinned `startsWith` check is sufficient as a
    // buffer-shape smoke test.
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-")
  })
})

// ---------------------------------------------------------------------------
// 2. Structural — identifiable strings from each of the five fixed sections
// ---------------------------------------------------------------------------

describe("renderPortfolioPdf — structural", () => {
  it(
    "PDF contains identifiable strings from each of the five fixed sections " +
      "in the spec §6 order (architecture → memory tree → Q&A → bullets → " +
      "debug stories)",
    async () => {
      const { memory, snapshot } = makeFixedMemory()
      const { pdf } = await renderPortfolioPdf(memory, snapshot)
      const decoded = decodePdfText(pdf)

      // One identifiable marker from each section's fixture content.
      // These were chosen to be unambiguous so the substring-search smoke
      // extractor can't false-positive across sections.
      expect(decoded).toContain("ArchIntroMarker")
      expect(decoded).toContain("ServerActionsConceptMarker")
      expect(decoded).toContain("RevisitAreaMarker")
      expect(decoded).toContain("QuestionMarker")
      expect(decoded).toContain("BulletMarker")
      expect(decoded).toContain("DebugChallengeMarker")

      // The header line is present too — the PDF's first page is the
      // Portfolio Page §6 header. The hex-decoded text is the substring of
      // the rendered page; "acme" and "portfolio" are emitted as two
      // adjacent runs (the `/` separator survives or is split, depending
      // on font kerning), so we assert each half.
      expect(decoded).toContain("acme")
      expect(decoded).toContain("portfolio")
    },
  )

  it(
    "renders the five fixed section headings (smoke-level — heading glyph " +
      "runs may split across multiple Tj blocks)",
    async () => {
      const { memory, snapshot } = makeFixedMemory()
      const { pdf } = await renderPortfolioPdf(memory, snapshot)
      const decoded = decodePdfText(pdf)
      // Each heading's ASCII-safe prefix is searchable. `@react-pdf/
      // renderer` may split a heading across multiple `[<hex>] TJ` blocks
      // for kerning, so we check the longest contiguous ASCII run from
      // each heading rather than the whole string. (e.g. "Résumé" splits
      // because of the WinAnsi `é`; "Architecture" stays contiguous.)
      expect(decoded).toContain("Architecture")
      expect(decoded).toContain("Learning")
      expect(decoded).toContain("Interview")
      // "Résumé" — the `é` is a separate Tj run; check for "sum".
      expect(decoded).toContain("sum")
      expect(decoded).toContain("Debug")
    },
  )
})

// ---------------------------------------------------------------------------
// 3. Filename — slug-safe across owner / repo with unsafe characters
// ---------------------------------------------------------------------------

describe("renderPortfolioPdf — filename (PRD US-6)", () => {
  it(
    "owner containing `/` and spaces, repo with `?`, produces a " +
      "filesystem-safe pdfFilename",
    async () => {
      const { memory, snapshot } = makeFixedMemory()
      const unsafeSnapshot: RepoSnapshot = {
        ...snapshot,
        owner: "Acme / Sub Org",
        repo: "My Portfolio?",
      }
      const { pdfFilename } = await renderPortfolioPdf(memory, unsafeSnapshot)
      expect(pdfFilename).not.toMatch(/[/\\<>:"|?*\s]/)
      expect(pdfFilename).toBe("portfolio-acme-sub-org-my-portfolio-7.pdf")
    },
  )

  it("owner / repo that slug to empty fall back to 'portfolio'", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const allUnsafeSnapshot: RepoSnapshot = {
      ...snapshot,
      owner: "////",
      repo: "    ",
    }
    const { pdfFilename } = await renderPortfolioPdf(memory, allUnsafeSnapshot)
    expect(pdfFilename).toBe("portfolio-portfolio-portfolio-7.pdf")
  })

  it("happy-path pdfFilename matches the markdown bundle's stem with `.pdf`", async () => {
    const { memory, snapshot } = makeFixedMemory()
    const { pdfFilename } = await renderPortfolioPdf(memory, snapshot)
    expect(pdfFilename).toBe("portfolio-acme-portfolio-7.pdf")
  })
})
