// Tests for the `challenges` + `challenge_attempts` data-access layer
// (Issue #140).
//
// Every operation is exercised against a fresh in-memory SQLite with the real
// migrations applied — so the round-trip through Drizzle (including the JSON
// columns) and the (snapshot, type) unique constraint are covered end to end.
// No network, no LLM anywhere — mirrors `../diff/reviews.test.ts` and
// `../mapper/project-maps.test.ts`.

import Database from "better-sqlite3"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import {
  type ChallengeGradingResult,
  type NewRepoSnapshot,
  repoSnapshots,
} from "../schema"
import * as schema from "../schema"
import {
  createChallenge,
  createChallengeAttempt,
  getChallengeById,
  getChallengeByRepo,
  getChallengeBySnapshotAndType,
  getLatestChallengeAttempt,
  getLatestChallengeOutcome,
  gradeChallengeAttempt,
  listChallengeAttempts,
  listChallengesBySnapshot,
  saveChallenge,
  updateChallenge,
  type ChallengeAttemptSubmission,
  type ChallengeContent,
} from "./challenges"

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
    { path: "apps/web/lib/auth.ts", type: "blob", sha: "b", size: 80 },
    { path: "packages/db/src/schema.ts", type: "blob", sha: "c", size: 300 },
  ],
}

/** A complete add-small-field challenge, every cited path resolvable in M6. */
const content: ChallengeContent = {
  taskDescription:
    "Add a `displayName` field to the user record so the landing page can " +
    "show it after sign-in.",
  inScopeFiles: ["packages/db/src/schema.ts", "apps/web/app/page.tsx"],
  outOfScopeFiles: ["apps/web/lib/auth.ts"],
  acceptanceCriteria: [
    {
      id: "c1",
      detail: "Names the schema file as the place the new column is added.",
    },
    {
      id: "c2",
      detail: "Explains the migration step needed for the new column.",
    },
  ],
  sourceReferences: [
    {
      section: "keyFileMap",
      path: "packages/db/src/schema.ts",
      note: "The schema file is where user-record columns live.",
    },
    {
      section: "requestDataFlow",
      path: "apps/web/app/page.tsx",
      note: "The landing page is where the new column is rendered.",
    },
  ],
}

/** A second challenge of a different type — covers (snapshot, type) keying. */
const otherTypeContent: ChallengeContent = {
  taskDescription:
    "Add a loading state to the landing page while the session is resolving.",
  inScopeFiles: ["apps/web/app/page.tsx"],
  outOfScopeFiles: ["packages/db/src/schema.ts"],
  acceptanceCriteria: [
    { id: "c1", detail: "Names the page file as the place the state lives." },
  ],
  sourceReferences: [
    {
      section: "stateFlow",
      path: "apps/web/app/page.tsx",
      note: "The page owns the session-loading UI.",
    },
  ],
}

const submission: ChallengeAttemptSubmission = {
  explanation:
    "I would add a `displayName` text column in packages/db/src/schema.ts and " +
    "render it on apps/web/app/page.tsx after sign-in.",
  snippets: [
    {
      path: "packages/db/src/schema.ts",
      code: "displayName: text('display_name').notNull()",
    },
  ],
  filePaths: ["packages/db/src/schema.ts", "apps/web/app/page.tsx"],
}

const grading: ChallengeGradingResult = {
  score: 84,
  weakAreas: [
    {
      area: "migration",
      detail:
        "Did not mention generating a new migration after editing the schema.",
    },
  ],
  criterionResults: [
    {
      criterionId: "c1",
      passed: true,
      detail: "Named packages/db/src/schema.ts as the column site.",
    },
    {
      criterionId: "c2",
      passed: false,
      detail: "Did not articulate the migration step.",
    },
  ],
  feedback:
    "Solid explanation of where the field lives; remember the migration that " +
    "must follow the schema edit.",
}

/** Insert the sample snapshot and return its id. */
function seedSnapshot(db: CatalogDb): number {
  return db.insert(repoSnapshots).values(snapshot).returning().get().id
}

describe("challenges data-access — CRUD on challenges", () => {
  let db: CatalogDb
  let snapshotId: number

  beforeEach(() => {
    db = makeTestDb()
    snapshotId = seedSnapshot(db)
  })

  it("createChallenge stores the row and returns it", async () => {
    const row = await createChallenge(snapshotId, "add-small-field", content, db)
    expect(row.snapshotId).toBe(snapshotId)
    expect(row.type).toBe("add-small-field")
    expect(row.taskDescription).toContain("displayName")
    expect(row.inScopeFiles).toEqual(content.inScopeFiles)
    expect(row.outOfScopeFiles).toEqual(content.outOfScopeFiles)
    expect(row.acceptanceCriteria).toHaveLength(2)
    expect(row.sourceReferences[0]?.section).toBe("keyFileMap")
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  it("getChallengeBySnapshotAndType reads back JSON columns intact", async () => {
    await createChallenge(snapshotId, "add-small-field", content, db)
    const row = await getChallengeBySnapshotAndType(
      snapshotId,
      "add-small-field",
      db,
    )
    expect(row?.acceptanceCriteria).toEqual(content.acceptanceCriteria)
    expect(row?.sourceReferences).toEqual(content.sourceReferences)
    expect(row?.inScopeFiles).toEqual(content.inScopeFiles)
    expect(row?.outOfScopeFiles).toEqual(content.outOfScopeFiles)
  })

  it("getChallengeBySnapshotAndType returns null for a missing type", async () => {
    expect(
      await getChallengeBySnapshotAndType(snapshotId, "add-small-field", db),
    ).toBeNull()
  })

  it("getChallengeById reads by primary key", async () => {
    const created = await createChallenge(
      snapshotId,
      "add-small-field",
      content,
      db,
    )
    const row = await getChallengeById(created.id, db)
    expect(row?.id).toBe(created.id)
    expect(await getChallengeById(9999, db)).toBeNull()
  })

  it("getChallengeByRepo resolves the snapshot then the challenge", async () => {
    await createChallenge(snapshotId, "add-small-field", content, db)
    const row = await getChallengeByRepo(
      "acme",
      "portfolio",
      "add-small-field",
      "main",
      db,
    )
    expect(row?.snapshotId).toBe(snapshotId)
  })

  it("getChallengeByRepo returns null for an unknown repo", async () => {
    expect(
      await getChallengeByRepo("nope", "nope", "add-small-field", "main", db),
    ).toBeNull()
  })

  it("updateChallenge replaces content and bumps updatedAt", async () => {
    const created = await createChallenge(
      snapshotId,
      "add-small-field",
      content,
      db,
    )
    const updated = await updateChallenge(
      snapshotId,
      "add-small-field",
      { ...content, taskDescription: "Replaced task description." },
      db,
    )
    expect(updated?.taskDescription).toBe("Replaced task description.")
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(
      created.updatedAt.getTime(),
    )
  })

  it("updateChallenge returns null when there is nothing to update", async () => {
    expect(
      await updateChallenge(snapshotId, "add-small-field", content, db),
    ).toBeNull()
  })

  it("saveChallenge creates then replaces the row in place (R2 cache)", async () => {
    const first = await saveChallenge(
      snapshotId,
      "add-small-field",
      content,
      db,
    )
    const second = await saveChallenge(
      snapshotId,
      "add-small-field",
      { ...content, taskDescription: "Regenerated." },
      db,
    )
    // Same row id — replacement, not insertion.
    expect(second.id).toBe(first.id)
    expect(second.taskDescription).toBe("Regenerated.")
    // Still exactly one challenge for the (snapshot, type) cache key.
    const all = await listChallengesBySnapshot(snapshotId, db)
    expect(all).toHaveLength(1)
  })

  it("listChallengesBySnapshot returns every challenge for a snapshot", async () => {
    await createChallenge(snapshotId, "add-small-field", content, db)
    await createChallenge(
      snapshotId,
      "add-loading-error-state",
      otherTypeContent,
      db,
    )
    const rows = await listChallengesBySnapshot(snapshotId, db)
    expect(rows.map((r) => r.type).sort()).toEqual([
      "add-loading-error-state",
      "add-small-field",
    ])
  })

  it("(snapshot, type) unique constraint rejects a second insert", async () => {
    await createChallenge(snapshotId, "add-small-field", content, db)
    await expect(
      createChallenge(snapshotId, "add-small-field", content, db),
    ).rejects.toThrow()
  })

  it("two snapshots can each cache the same challenge type", async () => {
    const otherSnapshotId = db
      .insert(repoSnapshots)
      .values({ ...snapshot, ref: "develop", commitSha: "feedbeef" })
      .returning()
      .get().id
    await createChallenge(snapshotId, "add-small-field", content, db)
    const second = await createChallenge(
      otherSnapshotId,
      "add-small-field",
      content,
      db,
    )
    expect(second.snapshotId).toBe(otherSnapshotId)
  })
})

describe("challenges data-access — attempts (US-6) + latest outcome (R5)", () => {
  let db: CatalogDb
  let snapshotId: number
  let challengeId: number

  beforeEach(async () => {
    db = makeTestDb()
    snapshotId = seedSnapshot(db)
    const created = await createChallenge(
      snapshotId,
      "add-small-field",
      content,
      db,
    )
    challengeId = created.id
  })

  it("createChallengeAttempt stores and returns the row", async () => {
    const attempt = await createChallengeAttempt(challengeId, submission, db)
    expect(attempt.challengeId).toBe(challengeId)
    expect(attempt.explanation).toContain("displayName")
    expect(attempt.snippets[0]?.path).toBe("packages/db/src/schema.ts")
    expect(attempt.filePaths).toEqual(submission.filePaths)
    // Grading starts null — graded later by the M9 grading call.
    expect(attempt.grading).toBeNull()
    expect(attempt.submittedAt).toBeInstanceOf(Date)
  })

  it("preserves multiple attempts per challenge (US-6)", async () => {
    await createChallengeAttempt(challengeId, submission, db)
    await createChallengeAttempt(
      challengeId,
      { ...submission, explanation: "Second attempt — clearer this time." },
      db,
    )
    const all = await listChallengeAttempts(challengeId, db)
    expect(all).toHaveLength(2)
    expect(all[0]?.explanation).toContain("displayName")
    expect(all[1]?.explanation).toContain("Second attempt")
  })

  it("listChallengeAttempts returns attempts oldest first", async () => {
    const t1 = new Date("2026-05-24T10:00:00Z")
    const t2 = new Date("2026-05-24T11:00:00Z")
    const t3 = new Date("2026-05-24T12:00:00Z")
    await db
      .insert(schema.challengeAttempts)
      .values({ challengeId, ...submission, submittedAt: t3 })
      .run()
    await db
      .insert(schema.challengeAttempts)
      .values({ challengeId, ...submission, submittedAt: t1 })
      .run()
    await db
      .insert(schema.challengeAttempts)
      .values({ challengeId, ...submission, submittedAt: t2 })
      .run()
    const ordered = await listChallengeAttempts(challengeId, db)
    expect(ordered.map((a) => a.submittedAt.toISOString())).toEqual([
      t1.toISOString(),
      t2.toISOString(),
      t3.toISOString(),
    ])
  })

  it("getLatestChallengeAttempt returns the most recently submitted row", async () => {
    const t1 = new Date("2026-05-24T10:00:00Z")
    const t2 = new Date("2026-05-24T11:00:00Z")
    await db
      .insert(schema.challengeAttempts)
      .values({
        challengeId,
        ...submission,
        explanation: "Older attempt.",
        submittedAt: t1,
      })
      .run()
    await db
      .insert(schema.challengeAttempts)
      .values({
        challengeId,
        ...submission,
        explanation: "Newer attempt.",
        submittedAt: t2,
      })
      .run()
    const latest = await getLatestChallengeAttempt(challengeId, db)
    expect(latest?.explanation).toBe("Newer attempt.")
  })

  it("getLatestChallengeAttempt returns null for a challenge with no attempts", async () => {
    expect(await getLatestChallengeAttempt(challengeId, db)).toBeNull()
  })

  it("getLatestChallengeOutcome bundles the latest attempt and its grading", async () => {
    const empty = await getLatestChallengeOutcome(challengeId, db)
    expect(empty.attempt).toBeNull()
    expect(empty.grading).toBeNull()

    const attempt = await createChallengeAttempt(challengeId, submission, db)

    const ungraded = await getLatestChallengeOutcome(challengeId, db)
    // Submitted but not yet graded — attempt is present, grading is null.
    expect(ungraded.attempt?.id).toBe(attempt.id)
    expect(ungraded.grading).toBeNull()

    await gradeChallengeAttempt(attempt.id, grading, db)

    const graded = await getLatestChallengeOutcome(challengeId, db)
    expect(graded.attempt?.id).toBe(attempt.id)
    expect(graded.grading?.score).toBe(84)
    expect(graded.grading?.weakAreas[0]?.area).toBe("migration")
    expect(graded.grading?.criterionResults).toHaveLength(2)
    expect(graded.grading?.feedback).toContain("migration")
  })

  it("gradeChallengeAttempt stores the grading and round-trips JSON", async () => {
    const attempt = await createChallengeAttempt(challengeId, submission, db)
    const graded = await gradeChallengeAttempt(attempt.id, grading, db)
    expect(graded?.grading?.score).toBe(84)
    expect(graded?.grading?.weakAreas[0]?.detail).toContain("migration")
    expect(graded?.grading?.criterionResults[0]?.passed).toBe(true)
    expect(graded?.grading?.criterionResults[1]?.passed).toBe(false)
  })

  it("gradeChallengeAttempt returns null when the attempt does not exist", async () => {
    expect(await gradeChallengeAttempt(9999, grading, db)).toBeNull()
  })

  it("re-grading overwrites the prior grading and leaves submittedAt alone", async () => {
    const attempt = await createChallengeAttempt(challengeId, submission, db)
    const submittedAt = attempt.submittedAt
    await gradeChallengeAttempt(attempt.id, grading, db)
    const regraded = await gradeChallengeAttempt(
      attempt.id,
      { ...grading, score: 95, weakAreas: [] },
      db,
    )
    expect(regraded?.grading?.score).toBe(95)
    expect(regraded?.grading?.weakAreas).toEqual([])
    // `submittedAt` drives R5's latest-outcome ordering — re-grading must not
    // silently reorder against newer attempts.
    expect(regraded?.submittedAt.toISOString()).toBe(submittedAt.toISOString())
  })

  it("when a challenge is regenerated via saveChallenge, attempts cascade away", async () => {
    await createChallengeAttempt(challengeId, submission, db)
    // Regenerate the challenge by deleting + saveChallenge — the foreign-key
    // cascade clears prior attempts so the new challenge starts fresh.
    await db
      .delete(schema.challenges)
      .where(eq(schema.challenges.id, challengeId))
      .run()
    const fresh = await saveChallenge(
      snapshotId,
      "add-small-field",
      { ...content, taskDescription: "Regenerated." },
      db,
    )
    expect(await listChallengeAttempts(fresh.id, db)).toEqual([])
  })
})
