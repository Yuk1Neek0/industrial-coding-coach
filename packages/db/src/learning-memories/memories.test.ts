// Tests for the `learning_memories` data-access layer (Issue #176).
//
// create / read / upsert + stale-detection are exercised against a fresh
// in-memory SQLite with the real migrations applied, so the round-trip
// through the M11 snapshot data-access layer is covered end to end. Mirrors
// `../mapper/project-maps.test.ts` and `../learning-units/units.test.ts`.
// No network, no LLM — server-side only.

import Database from "better-sqlite3"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import {
  type NewRepoSnapshot,
  learningMemories,
  repoSnapshots,
} from "../schema"
import * as schema from "../schema"
import {
  createMemory,
  getMemory,
  getMemoryByRepo,
  isMemoryStale,
  type LearningMemoryContent,
  updateMemory,
  upsertMemory,
} from "./memories"

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

const snapshot: NewRepoSnapshot = {
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

/** A fully-shaped learning-memory content body. */
const content: LearningMemoryContent = {
  interviewQa: [
    {
      question: "Why does the project use Next.js?",
      answer:
        "Next.js App Router fits the per-route Server Action surface this project ships.",
      groundArea: "stack",
      sourceReferences: ["apps/web/app/page.tsx"],
    },
  ],
  resumeBullets: [
    {
      text: "Built a learning-coach app with Next.js Server Actions and Drizzle ORM",
      technologies: ["Next.js", "Drizzle ORM"],
      sourceFiles: ["apps/web/app/page.tsx", "packages/db/src/schema.ts"],
    },
  ],
  architectureExplanation: {
    intro: "A local-first Next.js coach for AI-assisted projects.",
    stackSection: {
      heading: "Stack & tooling",
      body: "Next.js App Router, Drizzle ORM over SQLite.",
      citedFiles: ["packages/db/src/schema.ts"],
    },
    architectureSection: {
      heading: "Architectural layers",
      body: "The app layer renders pages; the db package owns persistence.",
      citedFiles: ["apps/web/app/page.tsx"],
    },
    keyFlowsSection: {
      heading: "Key flows",
      body: "Request → Server Action → Drizzle query.",
      citedFiles: ["apps/web/app/page.tsx", "packages/db/src/schema.ts"],
    },
  },
  learningMemoryTree: {
    branches: [
      {
        heading: "Stack & tooling",
        leaves: [
          {
            concept: "Drizzle ORM",
            detail: "Typed SQLite schema and migrations.",
            source: {
              milestone: "M5",
              rowId: 1,
              locator: "packages/db/src/schema.ts",
            },
          },
        ],
      },
    ],
    stillToRevisit: [
      {
        area: "data-flow",
        detail: "Couldn't explain why the Drizzle migration regenerates.",
        source: { milestone: "M7", rowId: 42 },
      },
    ],
  },
  debugStories: [
    {
      challengeType: "debug",
      taskSummary: "Trace why the /health endpoint returned 500.",
      explanationExcerpt:
        "The Server Action threw before responding because the DB client wasn't initialised on cold-start.",
      gradingResult: {
        score: 78,
        passed: true,
        topWeakArea: {
          area: "error-handling",
          detail: "Did not name the lazy-init source of the cold-start bug.",
        },
      },
    },
  ],
}

describe("learning-memories DAL", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    const inserted = db
      .insert(repoSnapshots)
      .values(snapshot)
      .returning()
      .get()
    snapshotId = inserted.id
  })

  it("inserts a memory row and reads it back", async () => {
    const created = await createMemory(snapshotId, content, db)
    expect(created.id).toBeGreaterThan(0)
    expect(created.snapshotId).toBe(snapshotId)
    expect(created.interviewQa).toEqual(content.interviewQa)
    expect(created.resumeBullets).toEqual(content.resumeBullets)
    expect(created.architectureExplanation).toEqual(content.architectureExplanation)
    expect(created.learningMemoryTree).toEqual(content.learningMemoryTree)
    expect(created.debugStories).toEqual(content.debugStories)
    expect(created.generatedAt).toBeInstanceOf(Date)

    const fetched = await getMemory(snapshotId, db)
    expect(fetched).not.toBeNull()
    expect(fetched?.id).toBe(created.id)
  })

  it("returns null from getMemory when no memory exists for the snapshot", async () => {
    expect(await getMemory(snapshotId, db)).toBeNull()
  })

  it("getMemoryByRepo resolves the snapshot via owner/repo/ref", async () => {
    await createMemory(snapshotId, content, db)
    const fetched = await getMemoryByRepo("acme", "portfolio", "main", db)
    expect(fetched).not.toBeNull()
    expect(fetched?.snapshotId).toBe(snapshotId)
  })

  it("getMemoryByRepo returns null for an unimported repo", async () => {
    expect(await getMemoryByRepo("nope", "missing", "main", db)).toBeNull()
  })

  it("updateMemory replaces content on an existing row and bumps generatedAt", async () => {
    const first = await createMemory(snapshotId, content, db)
    const newContent: LearningMemoryContent = {
      ...content,
      interviewQa: [
        {
          question: "What is Drizzle ORM?",
          answer: "A type-safe SQL toolkit for TypeScript.",
          groundArea: "stack",
          sourceReferences: ["packages/db/src/schema.ts"],
        },
      ],
      // Drizzle's `mode: "timestamp"` stores seconds, so a sub-second
      // update returns the same timestamp; use `>=` per the project
      // convention rather than mock the clock.
    }
    const updated = await updateMemory(snapshotId, newContent, db)
    expect(updated).not.toBeNull()
    expect(updated?.id).toBe(first.id)
    expect(updated?.interviewQa).toEqual(newContent.interviewQa)
    expect(updated!.generatedAt.getTime()).toBeGreaterThanOrEqual(
      first.generatedAt.getTime(),
    )
  })

  it("updateMemory returns null when the snapshot has no memory yet", async () => {
    expect(await updateMemory(snapshotId, content, db)).toBeNull()
  })

  it("upsertMemory is idempotent on snapshotId — same row, replaced content", async () => {
    const first = await upsertMemory(snapshotId, content, db)
    const newContent: LearningMemoryContent = {
      ...content,
      resumeBullets: [
        {
          text: "Designed M10 portfolio synthesis layer in TypeScript with bounded SDK calls",
          technologies: ["TypeScript", "Anthropic SDK"],
          sourceFiles: ["packages/db/src/schema.ts"],
        },
      ],
    }
    const second = await upsertMemory(snapshotId, newContent, db)

    expect(second.id).toBe(first.id)
    expect(second.snapshotId).toBe(snapshotId)
    expect(second.resumeBullets).toEqual(newContent.resumeBullets)

    // Exactly one row in the table after two upserts.
    const all = db.select().from(learningMemories).all()
    expect(all).toHaveLength(1)
  })

  it("cascade-deletes the memory when its snapshot is removed", async () => {
    await createMemory(snapshotId, content, db)
    expect(await getMemory(snapshotId, db)).not.toBeNull()

    db.delete(repoSnapshots).where(eq(repoSnapshots.id, snapshotId)).run()

    expect(await getMemory(snapshotId, db)).toBeNull()
  })

  describe("isMemoryStale", () => {
    it("returns true when no memory exists for the snapshot", async () => {
      expect(await isMemoryStale(snapshotId, db)).toBe(true)
    })

    it("returns false when the memory is at least as new as the snapshot", async () => {
      // Force the snapshot's updatedAt back so the just-created memory wins.
      const past = new Date(Date.now() - 60_000)
      db.update(repoSnapshots)
        .set({ updatedAt: past })
        .where(eq(repoSnapshots.id, snapshotId))
        .run()
      await createMemory(snapshotId, content, db)

      expect(await isMemoryStale(snapshotId, db)).toBe(false)
    })

    it("returns true when the snapshot updated after the memory was generated", async () => {
      // Create a memory at "now", then push the snapshot's updatedAt forward.
      await createMemory(snapshotId, content, db)
      const future = new Date(Date.now() + 60_000)
      db.update(repoSnapshots)
        .set({ updatedAt: future })
        .where(eq(repoSnapshots.id, snapshotId))
        .run()

      expect(await isMemoryStale(snapshotId, db)).toBe(true)
    })
  })
})
