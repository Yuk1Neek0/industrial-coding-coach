// Unit tests for the CCPM-task local adapter (Issue #132, R1, FR-1).
//
// Reads strictly via the M11 snapshot data-access layer (`listRepoFiles` /
// `getRepoFile`) on an in-memory SQLite — these tests never touch the live
// filesystem and never reach GitHub. The DB is seeded with a snapshot whose
// `repo_files` rows carry CCPM task fixtures.
//
// Covers:
//   - `parseCcpmTaskFile` (frontmatter + body splitting, depends_on list,
//      missing-frontmatter fallback).
//   - `listCcpmTasks` against a snapshot with tasks (happy path) and against
//      one with no tasks (clean miss → empty array).
//   - `fetchCcpmTask` (one task by taskRef, missing task → null).
//   - Normalization round-trip onto `LearningUnitInput`.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import {
  repoFiles,
  repoSnapshots,
  type NewRepoFile,
  type NewRepoSnapshot,
} from "../schema"
import * as schema from "../schema"
import {
  fetchCcpmTask,
  listCcpmTasks,
  normalizeCcpmTaskToLearningUnitInput,
  parseCcpmTaskFile,
} from "./ccpm-task-adapter"

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

const SAMPLE_SNAPSHOT: NewRepoSnapshot = {
  owner: "acme",
  repo: "widgets",
  ref: "main",
  commitSha: "c-main",
  defaultBranch: "main",
  description: "Widget factory",
  primaryLanguage: "TypeScript",
  isPrivate: false,
  htmlUrl: "https://github.com/acme/widgets",
  fileTree: [
    { path: ".claude/epics/foo/001.md", type: "blob", sha: "f-001", size: 100 },
  ],
}

/** Seed a snapshot row and return its generated id. */
function seedSnapshot(
  db: CatalogDb,
  overrides: Partial<NewRepoSnapshot> = {},
): number {
  const [row] = db
    .insert(repoSnapshots)
    .values({ ...SAMPLE_SNAPSHOT, ...overrides })
    .returning()
    .all()
  return row!.id
}

/** Seed a key-file row on a snapshot. */
function seedFile(
  db: CatalogDb,
  snapshotId: number,
  path: string,
  content: string,
  category: NewRepoFile["category"] = "other",
): void {
  db.insert(repoFiles)
    .values({
      snapshotId,
      path,
      sha: `sha-${path}`,
      size: content.length,
      content,
      category,
    })
    .run()
}

/** A representative CCPM task file with full frontmatter + body. */
const taskWithFrontmatter = `---
name: Add a /health endpoint
status: open
created: 2026-05-24T19:58:51Z
updated: 2026-05-24T19:58:51Z
github: https://github.com/acme/widgets/issues/42
depends_on: [40, 41]
parallel: true
conflicts_with: []
---

# Task: Add a /health endpoint

## Description

Adds a small route handler returning 200 OK.

## Acceptance Criteria
- [ ] Endpoint returns 200 OK
- [ ] Endpoint is reachable
`

/** A task file with no body — only frontmatter. */
const taskWithoutBody = `---
name: Bare task
status: in-progress
github: https://github.com/acme/widgets/issues/7
depends_on: []
---
`

/** A second task file (different epic) — for the multi-task listing test. */
const taskInBarEpic = `---
name: Wire the worker queue
status: closed
github: https://github.com/acme/widgets/issues/12
depends_on: [11]
---

# Task: Wire the worker queue

Some body text.
`

describe("parseCcpmTaskFile", () => {
  it("parses the standard frontmatter and the body", () => {
    const parsed = parseCcpmTaskFile(taskWithFrontmatter, "epic/foo/001")
    expect(parsed.taskRef).toBe("epic/foo/001")
    expect(parsed.frontmatter.name).toBe("Add a /health endpoint")
    expect(parsed.frontmatter.status).toBe("open")
    expect(parsed.frontmatter.github).toBe(
      "https://github.com/acme/widgets/issues/42",
    )
    expect(parsed.frontmatter.dependsOn).toEqual([40, 41])
    expect(parsed.body).toContain("# Task: Add a /health endpoint")
    expect(parsed.body).toContain("- [ ] Endpoint returns 200 OK")
  })

  it("returns an empty body for a task with frontmatter only", () => {
    const parsed = parseCcpmTaskFile(taskWithoutBody, "epic/foo/007")
    expect(parsed.frontmatter.name).toBe("Bare task")
    expect(parsed.frontmatter.status).toBe("in-progress")
    expect(parsed.body).toBe("")
  })

  it("treats a file with no frontmatter delimiter as all body", () => {
    const noFront = "Just some markdown with no frontmatter."
    const parsed = parseCcpmTaskFile(noFront, "epic/foo/008")
    expect(parsed.frontmatter.name).toBeNull()
    expect(parsed.frontmatter.status).toBeNull()
    expect(parsed.body).toBe(noFront)
  })

  it("handles a missing depends_on as an empty array", () => {
    const noDeps = `---
name: x
status: open
---
body
`
    const parsed = parseCcpmTaskFile(noDeps, "epic/foo/009")
    expect(parsed.frontmatter.dependsOn).toEqual([])
  })

  it("ignores unknown frontmatter keys without failing", () => {
    const extra = `---
name: x
status: open
parallel: true
conflicts_with: [3, 4]
---
body
`
    const parsed = parseCcpmTaskFile(extra, "epic/foo/010")
    expect(parsed.frontmatter.name).toBe("x")
    expect(parsed.body).toBe("body")
  })

  it("unwraps single- and double-quoted scalar values", () => {
    const quoted = `---
name: "Quoted name"
status: 'open'
github: https://example.com
depends_on: []
---
`
    const parsed = parseCcpmTaskFile(quoted, "epic/foo/011")
    expect(parsed.frontmatter.name).toBe("Quoted name")
    expect(parsed.frontmatter.status).toBe("open")
  })
})

describe("listCcpmTasks", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns every CCPM task in the snapshot, normalized to LearningUnitInput", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, ".claude/epics/foo/001.md", taskWithFrontmatter)
    seedFile(db, id, ".claude/epics/bar/012.md", taskInBarEpic)
    // Noise: an `epic.md` (must be skipped) and a non-task `.md` (must be skipped).
    seedFile(db, id, ".claude/epics/foo/epic.md", "# Epic foo\n")
    seedFile(db, id, ".claude/epics/foo/001-analysis.md", "# Analysis\n")
    seedFile(db, id, ".claude/epics/foo/github-mapping.md", "# Mapping\n")
    // Noise: an archived epic must not be picked up.
    seedFile(
      db,
      id,
      ".claude/epics/archived/old/099.md",
      `---\nname: archived\nstatus: closed\n---\nbody\n`,
    )
    // Noise: a non-CCPM markdown file must be skipped.
    seedFile(db, id, "README.md", "# Readme\n")

    const tasks = await listCcpmTasks("acme", "widgets", { db })
    expect(tasks).toHaveLength(2)
    expect(tasks[0]!.source).toBe("ccpm-task")
    expect(tasks[0]!.issueRef).toBe("epic/bar/012")
    expect(tasks[1]!.issueRef).toBe("epic/foo/001")
    expect(tasks[0]!.title).toBe("Wire the worker queue")
    expect(tasks[0]!.state).toBe("closed")
    expect(tasks[0]!.linkedPrs).toEqual([])
    expect(tasks[1]!.state).toBe("open")
    expect(tasks[1]!.labels).toContain("status:open")
  })

  it("returns an empty array for a snapshot with no CCPM tasks", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, "package.json", "{}", "package-manifest")
    seedFile(db, id, "README.md", "# Readme\n")
    const tasks = await listCcpmTasks("acme", "widgets", { db })
    expect(tasks).toEqual([])
  })

  it("returns an empty array when the snapshot is not present (clean miss)", async () => {
    const tasks = await listCcpmTasks("nobody", "nothing", { db })
    expect(tasks).toEqual([])
  })

  it("uses an `in-progress` task's `open` state for the learning workspace", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, ".claude/epics/foo/002.md", taskWithoutBody)
    const tasks = await listCcpmTasks("acme", "widgets", { db })
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.state).toBe("open")
    expect(tasks[0]!.labels).toContain("status:in-progress")
  })
})

describe("fetchCcpmTask", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns one task by its stable taskRef", async () => {
    const id = seedSnapshot(db)
    seedFile(db, id, ".claude/epics/foo/001.md", taskWithFrontmatter)

    const task = await fetchCcpmTask("acme", "widgets", "epic/foo/001", { db })
    expect(task).not.toBeNull()
    expect(task!.source).toBe("ccpm-task")
    expect(task!.title).toBe("Add a /health endpoint")
    expect(task!.body).toContain("# Task: Add a /health endpoint")
    expect(task!.labels).toEqual(["status:open"])
    expect(task!.linkedPrs).toEqual([])
  })

  it("returns null for a taskRef whose file is not in the snapshot", async () => {
    seedSnapshot(db)
    const task = await fetchCcpmTask("acme", "widgets", "epic/foo/999", { db })
    expect(task).toBeNull()
  })

  it("returns null for a malformed taskRef string", async () => {
    seedSnapshot(db)
    const task = await fetchCcpmTask("acme", "widgets", "not-a-real-ref", { db })
    expect(task).toBeNull()
  })

  it("returns null when the snapshot itself is missing", async () => {
    const task = await fetchCcpmTask("nobody", "nothing", "epic/foo/001", {
      db,
    })
    expect(task).toBeNull()
  })
})

describe("normalizeCcpmTaskToLearningUnitInput — round-trip (R1)", () => {
  it("folds a CCPM task into the same shape a GitHub issue normalizes to", () => {
    const parsed = parseCcpmTaskFile(taskWithFrontmatter, "epic/foo/001")
    const input = normalizeCcpmTaskToLearningUnitInput(parsed)
    expect(input).toEqual({
      source: "ccpm-task",
      issueRef: "epic/foo/001",
      title: "Add a /health endpoint",
      body: expect.stringContaining("# Task: Add a /health endpoint"),
      labels: ["status:open"],
      state: "open",
      linkedPrs: [],
    })
  })

  it("falls back to the taskRef for the title when frontmatter `name` is missing", () => {
    const noName = `---
status: open
---
body
`
    const parsed = parseCcpmTaskFile(noName, "epic/foo/050")
    const input = normalizeCcpmTaskToLearningUnitInput(parsed)
    expect(input.title).toBe("epic/foo/050")
  })

  it("always emits an empty linkedPrs (CCPM has no GitHub PR links)", () => {
    const parsed = parseCcpmTaskFile(taskInBarEpic, "epic/bar/012")
    const input = normalizeCcpmTaskToLearningUnitInput(parsed)
    expect(input.linkedPrs).toEqual([])
  })
})
