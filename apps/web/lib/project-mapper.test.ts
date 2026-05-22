// Tests for the Project Logic Mapper server-side data-access layer (#108).
//
// Exercises `runMap` / `getMapPageData` / `listChooserRepos` end to end against
// a fresh in-memory SQLite with the real `@workspace/db` migrations applied —
// the same fixture style as `packages/db/src/mapper/project-maps.test.ts`.
//
// CI contract: the LangGraph mapping pipeline is driven by a SCRIPTED
// `MapperModel` — no `ANTHROPIC_API_KEY`, no network, zero live calls. This
// mirrors how the M6 pipeline's own tests (`packages/ai/.../pipeline.test.ts`)
// inject a fake model.

import type { MapperModel, MapperModelRequest } from "@workspace/ai/mapper"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "@workspace/db"
import {
  type NewRepoFile,
  type NewRepoSnapshot,
  type RepoTreeEntry,
  repoFiles,
  repoSnapshots,
} from "@workspace/db/schema"
import * as schema from "@workspace/db/schema"

import {
  getMapPageData,
  listChooserRepos,
  runMap,
} from "./project-mapper"

// The real migrations live in the `@workspace/db` package.
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

/** A small but realistic snapshot file tree. */
const fileTree: RepoTreeEntry[] = [
  { path: "package.json", type: "blob", sha: "a", size: 120 },
  { path: "apps/web", type: "tree", sha: "b" },
  { path: "apps/web/app/page.tsx", type: "blob", sha: "c", size: 200 },
  { path: "apps/web/app/actions.ts", type: "blob", sha: "d", size: 150 },
]

const snapshot: NewRepoSnapshot = {
  owner: "acme",
  repo: "portfolio",
  ref: "main",
  commitSha: "deadbeef",
  defaultBranch: "main",
  htmlUrl: "https://github.com/acme/portfolio",
  fileTree,
}

/** Imported key files — content the ingestion + retrieval layers read. */
const keyFiles: Omit<NewRepoFile, "snapshotId">[] = [
  {
    path: "package.json",
    content: JSON.stringify({
      name: "portfolio",
      dependencies: { next: "16.0.0", react: "19.0.0" },
    }),
    size: 120,
    sha: "a",
    category: "package-manifest",
  },
  {
    path: "apps/web/app/page.tsx",
    content:
      "import { something } from './actions'\nexport default function Page() { return null }",
    size: 200,
    sha: "c",
    category: "source",
  },
  {
    path: "apps/web/app/actions.ts",
    content: "export async function something() { return 1 }",
    size: 150,
    sha: "d",
    category: "source",
  },
]

/** Insert the sample snapshot + its key files; return the snapshot id. */
function seedSnapshot(db: CatalogDb): number {
  const id = db.insert(repoSnapshots).values(snapshot).returning().get().id
  db.insert(repoFiles)
    .values(keyFiles.map((f) => ({ ...f, snapshotId: id })))
    .run()
  return id
}

/**
 * A scripted {@link MapperModel}: it reads the node's system prompt to decide
 * which JSON document to return, so the pipeline's six agentic nodes each get a
 * valid, well-typed reply. Every cited path is a real snapshot path so the
 * integrity check passes.
 */
function createScriptedModel(): MapperModel {
  return {
    invoke(request: MapperModelRequest): Promise<string> {
      const sys = request.system.toLowerCase()
      if (sys.includes("architecture")) {
        return Promise.resolve(
          JSON.stringify([
            { title: "Frontend", detail: "Next.js App Router renders pages." },
          ]),
        )
      }
      if (sys.includes("files a junior developer must know")) {
        return Promise.resolve(
          JSON.stringify([
            { path: "apps/web/app/page.tsx", role: "The home page." },
          ]),
        )
      }
      if (sys.includes("debug path")) {
        return Promise.resolve(
          JSON.stringify([
            {
              location: "apps/web/app/page.tsx",
              guidance: "Start here for render bugs.",
            },
          ]),
        )
      }
      // The three flow nodes share one system prompt.
      return Promise.resolve(
        JSON.stringify([
          {
            order: 1,
            description: "A request enters.",
            path: "apps/web/app/page.tsx",
          },
        ]),
      )
    },
  }
}

describe("project-mapper data-access", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("runMap returns not-imported for a repo with no snapshot", async () => {
    const result = await runMap("nobody", "nothing", db, createScriptedModel())
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.kind).toBe("not-imported")
  })

  it("runMap runs the pipeline, persists the map, and reads it back", async () => {
    seedSnapshot(db)
    const result = await runMap(
      "acme",
      "portfolio",
      db,
      createScriptedModel(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // All seven pipeline outputs are present on the view.
    expect(result.map.architectureOverview.length).toBeGreaterThan(0)
    expect(result.map.keyFileMap.length).toBeGreaterThan(0)
    expect(result.map.requestDataFlow.length).toBeGreaterThan(0)
    expect(result.map.stateFlow.length).toBeGreaterThan(0)
    expect(result.map.aiCallFlow.length).toBeGreaterThan(0)
    expect(result.map.mermaidDiagram).toContain("flowchart")
    expect(result.map.debugPath.length).toBeGreaterThan(0)

    // The map persisted: a fresh page-data read returns it.
    const page = await getMapPageData("acme", "portfolio", db)
    expect(page.snapshotExists).toBe(true)
    expect(page.map).not.toBeNull()
    expect(page.map?.keyFileMap[0]?.path).toBe("apps/web/app/page.tsx")
  })

  it("runMap's cited file references pass the integrity check", async () => {
    seedSnapshot(db)
    const result = await runMap(
      "acme",
      "portfolio",
      db,
      createScriptedModel(),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.map.integrity.ok).toBe(true)
    expect(result.map.integrity.missingKeyFiles).toEqual([])
    expect(result.map.integrity.missingFlowPaths).toEqual([])
  })

  it("getMapPageData reports a not-imported repo", async () => {
    const page = await getMapPageData("nobody", "nothing", db)
    expect(page.snapshotExists).toBe(false)
    expect(page.identity).toBeNull()
    expect(page.map).toBeNull()
  })

  it("getMapPageData returns identity but no map before mapping", async () => {
    seedSnapshot(db)
    const page = await getMapPageData("acme", "portfolio", db)
    expect(page.snapshotExists).toBe(true)
    expect(page.identity?.owner).toBe("acme")
    expect(page.map).toBeNull()
  })

  it("listChooserRepos flags whether each repo has a stored map", async () => {
    seedSnapshot(db)
    const before = await listChooserRepos(db)
    expect(before).toHaveLength(1)
    expect(before[0]?.hasMap).toBe(false)

    await runMap("acme", "portfolio", db, createScriptedModel())
    const after = await listChooserRepos(db)
    expect(after[0]?.hasMap).toBe(true)
  })
})
