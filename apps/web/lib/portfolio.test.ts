// Unit tests for the M10 Portfolio Page server-side orchestration
// (`lib/portfolio.ts`, task #184).
//
// Coverage targets:
//   - getPortfolioPageData — snapshot-missing, memory-missing, fresh + stale.
//   - regenerateMemory      — happy path (composers + injected SDK), missing
//                             API key, integrity failure, length violation,
//                             unknown snapshot.
//   - exportPortfolioBundle — happy path + no-memory + unknown-snapshot.
//   - exportPortfolioPdf    — happy path + no-memory.
//
// CI contract: every bounded SDK call is injected as a fake — no
// `ANTHROPIC_API_KEY`, no live network. Mirrors the in-memory SQLite harness
// from `apps/web/lib/learning-units.test.ts`.

import path from "node:path"
import { fileURLToPath } from "node:url"

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  type ArchitectureExplanation,
  type CatalogDb,
  type DebugStory,
  type InterviewQA,
  type LearningMemoryTree,
  type NewRepoSnapshot,
  repoSnapshots,
  type ResumeBullet,
} from "@workspace/db"
import {
  createMemory,
  type IntegrityResult,
  InterviewQAIntegrityError,
  ResumeBulletsIntegrityError,
} from "@workspace/db/learning-memories"
import * as schema from "@workspace/db/schema"

import {
  exportPortfolioBundle,
  exportPortfolioPdf,
  getPortfolioPageData,
  regenerateMemory,
} from "./portfolio"

const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "db",
  "drizzle",
)

/** A fresh in-memory catalog DB with the real migrations applied. */
function makeTestDb(): CatalogDb {
  const sqlite = new Database(":memory:")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder })
  return db as unknown as CatalogDb
}

const snapshotInsert: NewRepoSnapshot = {
  owner: "acme",
  repo: "portfolio",
  ref: "main",
  commitSha: "deadbeef",
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/portfolio",
  fileTree: [
    { path: "apps/web/app/page.tsx", type: "blob", sha: "a", size: 200 },
  ],
}

function seedSnapshot(db: CatalogDb): number {
  const row = db.insert(repoSnapshots).values(snapshotInsert).returning().get()
  return row.id
}

/** A minimal-but-valid `ArchitectureExplanation`. */
const archFixture: ArchitectureExplanation = {
  intro: "A small portfolio app.",
  stackSection: {
    heading: "Stack",
    body: "Next.js + SQLite.",
    citedFiles: ["apps/web/app/page.tsx"],
  },
  architectureSection: {
    heading: "Architecture",
    body: "App Router under apps/web/app.",
    citedFiles: ["apps/web/app/page.tsx"],
  },
  keyFlowsSection: {
    heading: "Key flows",
    body: "Page loads call SQLite directly.",
    citedFiles: ["apps/web/app/page.tsx"],
  },
}

const treeFixture: LearningMemoryTree = {
  branches: [
    {
      heading: "From learning units",
      leaves: [
        {
          concept: "Server Actions",
          detail: "Apply server-only auth checks.",
          source: { milestone: "M7", rowId: 1, locator: "epic/auth/003" },
        },
      ],
    },
  ],
  stillToRevisit: [],
}

const storyFixture: DebugStory = {
  challengeType: "expand-feature",
  taskSummary: "Add a /health endpoint.",
  explanationExcerpt: "I used a route handler and returned JSON.",
  gradingResult: { score: 82, passed: true },
}

const qaFixture: InterviewQA[] = [
  {
    question: "Why does this project use Next.js Server Actions?",
    answer: "Server-only auth checks live there.",
    groundArea: "architecture",
    sourceReferences: ["apps/web/app/page.tsx"],
  },
]

const bulletsFixture: ResumeBullet[] = [
  {
    text:
      "Built a portfolio web app with Next.js and SQLite, shipping authenticated server actions backed by Drizzle.",
    technologies: ["Next.js", "SQLite"],
    sourceFiles: ["apps/web/app/page.tsx"],
  },
]

/* Stub composers + generators — never call the real backends so the tests
 * stay deterministic and CI runs without an API key or live DB rows. */
const stubComposers = {
  composeArchitectureExplanation: async () => archFixture,
  composeLearningMemoryTree: async () => treeFixture,
  composeDebugStories: async () => [storyFixture],
}

describe("M10 portfolio orchestration — getPortfolioPageData", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns snapshotExists=false when the repo is not imported", async () => {
    const data = await getPortfolioPageData("ghost", "nope", db)
    expect(data.snapshotExists).toBe(false)
    expect(data.identity).toBeNull()
    expect(data.memory).toBeNull()
    expect(data.stale).toBe(false)
  })

  it("returns identity + memory=null when imported but no memory exists", async () => {
    const snapshotId = seedSnapshot(db)
    const data = await getPortfolioPageData("acme", "portfolio", db)
    expect(data.snapshotExists).toBe(true)
    expect(data.identity?.snapshotId).toBe(snapshotId)
    expect(data.identity?.owner).toBe("acme")
    expect(data.identity?.repo).toBe("portfolio")
    expect(data.identity?.branch).toBe("main")
    expect(data.memory).toBeNull()
    // Empty-memory case: the page renders the empty panel, NOT the banner —
    // we report `stale: false` even though the underlying DAL returns true.
    expect(data.stale).toBe(false)
  })

  it("returns stale=false when a fresh memory row exists", async () => {
    const snapshotId = seedSnapshot(db)
    await createMemory(
      snapshotId,
      {
        interviewQa: qaFixture,
        resumeBullets: bulletsFixture,
        architectureExplanation: archFixture,
        learningMemoryTree: treeFixture,
        debugStories: [storyFixture],
      },
      db,
    )
    const data = await getPortfolioPageData("acme", "portfolio", db)
    expect(data.memory).not.toBeNull()
    expect(data.stale).toBe(false)
  })
})

describe("M10 portfolio orchestration — regenerateMemory", () => {
  let db: CatalogDb
  const originalKey = process.env.ANTHROPIC_API_KEY

  beforeEach(() => {
    db = makeTestDb()
    // Strip the env var so the missing-api-key gate is the default case.
    delete process.env.ANTHROPIC_API_KEY
  })

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalKey
    }
  })

  it("returns missing-api-key when ANTHROPIC_API_KEY is unset", async () => {
    const snapshotId = seedSnapshot(db)
    const result = await regenerateMemory(snapshotId, db, {
      ...stubComposers,
      generateInterviewQA: async () => qaFixture,
      generateResumeBullets: async () => bulletsFixture,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("missing-api-key")
    }
  })

  it("returns unknown-snapshot when the snapshot id does not exist", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    const result = await regenerateMemory(99999, db, {
      ...stubComposers,
      generateInterviewQA: async () => qaFixture,
      generateResumeBullets: async () => bulletsFixture,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("unknown-snapshot")
    }
  })

  it("runs composers + injected SDK calls and upserts the row on the happy path", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    const snapshotId = seedSnapshot(db)

    const result = await regenerateMemory(snapshotId, db, {
      ...stubComposers,
      generateInterviewQA: async () => qaFixture,
      generateResumeBullets: async () => bulletsFixture,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.memoryId).toBeGreaterThan(0)

    // Verify the row was persisted via getPortfolioPageData.
    const data = await getPortfolioPageData("acme", "portfolio", db)
    expect(data.memory).not.toBeNull()
    expect(data.memory?.interviewQa).toEqual(qaFixture)
    expect(data.memory?.resumeBullets).toEqual(bulletsFixture)
    expect(data.memory?.architectureExplanation).toEqual(archFixture)
    expect(data.memory?.learningMemoryTree).toEqual(treeFixture)
    expect(data.memory?.debugStories).toEqual([storyFixture])
  })

  it("maps an InterviewQAIntegrityError to a typed integrity-failure result", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    const snapshotId = seedSnapshot(db)
    const integrity: Extract<IntegrityResult, { ok: false }> = {
      ok: false,
      missing: ["apps/web/missing.ts"],
    }
    const result = await regenerateMemory(snapshotId, db, {
      ...stubComposers,
      generateInterviewQA: async () => {
        throw new InterviewQAIntegrityError(qaFixture, integrity)
      },
      generateResumeBullets: async () => bulletsFixture,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("integrity-failure")
      expect(result.error.message).toMatch(/ground/)
    }
  })

  it("maps a ResumeBulletsIntegrityError to a typed integrity-failure result", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    const snapshotId = seedSnapshot(db)
    const integrity: Extract<IntegrityResult, { ok: false }> = {
      ok: false,
      missing: ["FastAPI"],
    }
    const result = await regenerateMemory(snapshotId, db, {
      ...stubComposers,
      generateInterviewQA: async () => qaFixture,
      generateResumeBullets: async () => {
        throw new ResumeBulletsIntegrityError(bulletsFixture, integrity)
      },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("integrity-failure")
    }
  })
})

describe("M10 portfolio orchestration — export paths", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("exportPortfolioBundle returns unknown-snapshot for an unknown id", async () => {
    const result = await exportPortfolioBundle(99999, db)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("unknown-snapshot")
    }
  })

  it("exportPortfolioBundle returns no-memory when the snapshot has no memory yet", async () => {
    const snapshotId = seedSnapshot(db)
    const result = await exportPortfolioBundle(snapshotId, db)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no-memory")
    }
  })

  it("exportPortfolioBundle returns a ZIP buffer + slug filename on the happy path", async () => {
    const snapshotId = seedSnapshot(db)
    await createMemory(
      snapshotId,
      {
        interviewQa: qaFixture,
        resumeBullets: bulletsFixture,
        architectureExplanation: archFixture,
        learningMemoryTree: treeFixture,
        debugStories: [storyFixture],
      },
      db,
    )
    const result = await exportPortfolioBundle(snapshotId, db)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.contentType).toBe("application/zip")
    expect(result.filename).toMatch(/^portfolio-acme-portfolio-\d+\.zip$/)
    expect(result.bytes.length).toBeGreaterThan(0)
    // ZIP files start with the PK signature (0x50 0x4b 0x03 0x04).
    expect(result.bytes[0]).toBe(0x50)
    expect(result.bytes[1]).toBe(0x4b)
  })

  it("exportPortfolioPdf returns no-memory when the snapshot has no memory yet", async () => {
    const snapshotId = seedSnapshot(db)
    const result = await exportPortfolioPdf(snapshotId, db)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("no-memory")
    }
  })

  it("exportPortfolioPdf returns a PDF buffer + slug filename on the happy path", async () => {
    const snapshotId = seedSnapshot(db)
    await createMemory(
      snapshotId,
      {
        interviewQa: qaFixture,
        resumeBullets: bulletsFixture,
        architectureExplanation: archFixture,
        learningMemoryTree: treeFixture,
        debugStories: [storyFixture],
      },
      db,
    )
    const result = await exportPortfolioPdf(snapshotId, db)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.contentType).toBe("application/pdf")
    expect(result.filename).toMatch(/^portfolio-acme-portfolio-\d+\.pdf$/)
    expect(result.bytes.length).toBeGreaterThan(0)
    // PDF files start with the %PDF magic bytes.
    expect(result.bytes.slice(0, 4).toString()).toBe("%PDF")
  })
})
