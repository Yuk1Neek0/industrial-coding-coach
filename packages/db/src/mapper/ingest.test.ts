// Tests for the deterministic snapshot ingestion module (Issue #103).
//
// `ingestSnapshot` is exercised purely (no DB) over representative snapshots —
// a Next.js app, a plain library, a CommonJS project, and a snapshot with no
// clear entry point. `ingestSnapshotForRepo` is exercised against a fresh
// in-memory SQLite with the real migrations applied, so the M11 data-access
// round-trip is covered end to end. No network, no LLM anywhere.

import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { beforeEach, describe, expect, it } from "vitest"

import type { CatalogDb } from "../client"
import * as schema from "../schema"
import {
  repoFiles,
  repoSnapshots,
  type NewRepoFile,
  type NewRepoSnapshot,
  type RepoTreeEntry,
} from "../schema"
import { ingestSnapshot, ingestSnapshotForRepo } from "./ingest"
import type { IngestionFile, IngestSnapshotInput } from "./ingest"

// --------------------------------------------------------------------------
// Pure-ingestion fixtures
// --------------------------------------------------------------------------

/** A blob tree entry. */
function blob(filePath: string, size = 100): RepoTreeEntry {
  return { path: filePath, type: "blob", sha: `sha-${filePath}`, size }
}

/** A tree (directory) entry. */
function tree(dirPath: string): RepoTreeEntry {
  return { path: dirPath, type: "tree", sha: `sha-${dirPath}` }
}

/** Build an `ingestSnapshot` input with sensible defaults. */
function makeInput(
  overrides: Partial<IngestSnapshotInput> = {},
): IngestSnapshotInput {
  return {
    owner: "acme",
    repo: "widgets",
    ref: "main",
    commitSha: "c-main",
    fileTree: [],
    files: [],
    ...overrides,
  }
}

/** A package.json key file from dependency maps and extra fields. */
function manifest(
  filePath: string,
  body: Record<string, unknown>,
): IngestionFile {
  return {
    path: filePath,
    content: JSON.stringify({ name: "sample", version: "0.0.0", ...body }),
  }
}

// --------------------------------------------------------------------------
// ingestSnapshot — file tree
// --------------------------------------------------------------------------

describe("ingestSnapshot — file tree", () => {
  it("builds a nested, sorted tree with synthesized parent directories", () => {
    const result = ingestSnapshot(
      makeInput({
        // `src` directory is NOT listed explicitly — it must be synthesized.
        fileTree: [
          blob("src/index.ts"),
          blob("src/util.ts"),
          blob("package.json"),
        ],
      }),
    )
    expect(result.fileTree.type).toBe("directory")
    const rootChildren = result.fileTree.children.map((c) => c.name)
    // Directories sort before files.
    expect(rootChildren).toEqual(["src", "package.json"])
    const src = result.fileTree.children.find((c) => c.name === "src")
    expect(src?.type).toBe("directory")
    expect(src?.children.map((c) => c.name)).toEqual(["index.ts", "util.ts"])
  })

  it("notes an empty file tree and still returns a valid result", () => {
    const result = ingestSnapshot(makeInput({ fileTree: [] }))
    expect(result.fileTree.children).toEqual([])
    expect(result.notes.some((n) => n.includes("file tree is empty"))).toBe(
      true,
    )
  })
})

// --------------------------------------------------------------------------
// ingestSnapshot — dependency graph
// --------------------------------------------------------------------------

describe("ingestSnapshot — dependency graph", () => {
  it("resolves relative imports to concrete in-repo modules", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("src/index.ts"), blob("src/util.ts")],
        files: [
          { path: "src/index.ts", content: `import { f } from "./util"` },
          { path: "src/util.ts", content: `export const f = 1` },
        ],
      }),
    )
    const edge = result.graph.edges.find((e) => e.from === "src/index.ts")
    expect(edge?.to).toBe("src/util.ts")
    expect(edge?.internal).toBe(true)
  })

  it("resolves a directory import to its index file", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("src/main.ts"), blob("src/lib/index.ts")],
        files: [
          { path: "src/main.ts", content: `import x from "./lib"` },
          { path: "src/lib/index.ts", content: `export default 1` },
        ],
      }),
    )
    const edge = result.graph.edges.find((e) => e.from === "src/main.ts")
    expect(edge?.to).toBe("src/lib/index.ts")
  })

  it("records an unresolved relative import as an internal edge to null", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("src/index.ts")],
        files: [
          { path: "src/index.ts", content: `import x from "./missing"` },
        ],
      }),
    )
    const edge = result.graph.edges[0]
    expect(edge?.internal).toBe(true)
    expect(edge?.to).toBeNull()
  })

  it("classifies bare specifiers as external edges and aggregates packages", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("src/a.ts"), blob("src/b.ts")],
        files: [
          {
            path: "src/a.ts",
            content: `import React from "react"\n` +
              `import { z } from "zod"`,
          },
          { path: "src/b.ts", content: `import { useState } from "react"` },
        ],
      }),
    )
    const react = result.externalDependencies.find((d) => d.name === "react")
    expect(react?.importedBy).toBe(2)
    expect(result.externalDependencies.map((d) => d.name)).toEqual([
      "react",
      "zod",
    ])
  })

  it("extracts the package name from a subpath / scoped specifier", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("src/a.ts")],
        files: [
          {
            path: "src/a.ts",
            content: `import x from "react/jsx-runtime"\n` +
              `import y from "@scope/pkg/sub"`,
          },
        ],
      }),
    )
    expect(result.externalDependencies.map((d) => d.name).sort()).toEqual([
      "@scope/pkg",
      "react",
    ])
  })

  it("excludes Node built-ins from external dependencies", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("src/a.ts")],
        files: [
          {
            path: "src/a.ts",
            content: `import fs from "node:fs"\nimport path from "path"`,
          },
        ],
      }),
    )
    expect(result.externalDependencies).toEqual([])
  })

  it("marks tree-only source files as unscanned modules", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("src/index.ts"), blob("src/untracked.ts")],
        files: [{ path: "src/index.ts", content: `export const a = 1` }],
      }),
    )
    const scanned = result.graph.modules.find(
      (m) => m.path === "src/index.ts",
    )
    const unscanned = result.graph.modules.find(
      (m) => m.path === "src/untracked.ts",
    )
    expect(scanned?.scanned).toBe(true)
    expect(unscanned?.scanned).toBe(false)
  })

  it("notes a snapshot with no JS/TS source files", () => {
    const result = ingestSnapshot(
      makeInput({ fileTree: [blob("README.md"), blob("styles.css")] }),
    )
    expect(result.graph.modules).toEqual([])
    expect(
      result.notes.some((n) => n.includes("No JS/TS source files")),
    ).toBe(true)
  })
})

// --------------------------------------------------------------------------
// ingestSnapshot — frameworks (reuse M5) and entry points
// --------------------------------------------------------------------------

describe("ingestSnapshot — frameworks and entry points", () => {
  it("reuses M5 stack detection for frameworks", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("package.json")],
        files: [
          manifest("package.json", {
            dependencies: { next: "16.0.0", react: "19.0.0" },
          }),
        ],
      }),
    )
    expect(result.frameworks.map((f) => f.name)).toContain("Next.js")
    // Only frameworks — React is a ui-library, not surfaced here.
    expect(result.frameworks.every((f) => f.category === "framework")).toBe(
      true,
    )
  })

  it("detects a package.json main field as an entry point", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("package.json"), blob("dist/index.js")],
        files: [manifest("package.json", { main: "dist/index.js" })],
      }),
    )
    const entry = result.entryPoints.find(
      (e) => e.path === "dist/index.js",
    )
    expect(entry).toBeDefined()
    expect(entry?.reason).toContain("main")
  })

  it("detects a Next.js App Router entry only when M5 detected Next.js", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("package.json"), blob("app/page.tsx")],
        files: [
          manifest("package.json", { dependencies: { next: "16.0.0" } }),
          { path: "app/page.tsx", content: `export default function P() {}` },
        ],
      }),
    )
    expect(result.entryPoints.some((e) => e.path === "app/page.tsx")).toBe(
      true,
    )
  })

  it("does not apply a framework convention the stack did not detect", () => {
    // app/page.tsx exists, but no Next.js dependency — not a Next.js entry.
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("app/page.tsx")],
        files: [
          { path: "app/page.tsx", content: `export default function P() {}` },
        ],
      }),
    )
    expect(
      result.entryPoints.some((e) => e.reason.includes("Next.js")),
    ).toBe(false)
  })

  it("falls back to a generic src/index entry when no framework matched", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("src/index.ts")],
        files: [{ path: "src/index.ts", content: `export const a = 1` }],
      }),
    )
    expect(result.entryPoints.map((e) => e.path)).toContain("src/index.ts")
  })

  it("degrades gracefully on a snapshot with no clear entry point", () => {
    // Source files exist, but none is a conventional entry and there is no
    // package.json main/bin field — the no-entry-point case.
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("src/helpers/format.ts"), blob("src/helpers/parse.ts")],
        files: [
          { path: "src/helpers/format.ts", content: `export const f = 1` },
          { path: "src/helpers/parse.ts", content: `export const p = 2` },
        ],
      }),
    )
    expect(result.entryPoints).toEqual([])
    expect(
      result.notes.some((n) => n.includes("No clear entry point")),
    ).toBe(true)
    // Ingestion still produced a valid graph for the orphan modules.
    expect(result.graph.modules).toHaveLength(2)
    expect(result.graph.modules.every((m) => !m.isEntryPoint)).toBe(true)
  })

  it("marks entry-point modules with isEntryPoint", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("src/index.ts"), blob("src/util.ts")],
        files: [
          { path: "src/index.ts", content: `import "./util"` },
          { path: "src/util.ts", content: `export const u = 1` },
        ],
      }),
    )
    const index = result.graph.modules.find((m) => m.path === "src/index.ts")
    const util = result.graph.modules.find((m) => m.path === "src/util.ts")
    expect(index?.isEntryPoint).toBe(true)
    expect(util?.isEntryPoint).toBe(false)
  })
})

// --------------------------------------------------------------------------
// ingestSnapshot — CommonJS, determinism, graceful degradation
// --------------------------------------------------------------------------

describe("ingestSnapshot — robustness", () => {
  it("ingests a CommonJS project that uses require()", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("index.js"), blob("lib.js")],
        files: [
          {
            path: "index.js",
            content: `const lib = require("./lib")\n` +
              `const express = require("express")`,
          },
          { path: "lib.js", content: `module.exports = {}` },
        ],
      }),
    )
    const internalEdge = result.graph.edges.find((e) => e.internal)
    expect(internalEdge?.to).toBe("lib.js")
    expect(internalEdge?.kind).toBe("require")
    expect(result.externalDependencies.map((d) => d.name)).toContain(
      "express",
    )
  })

  it("degrades gracefully on an unparseable package.json", () => {
    const result = ingestSnapshot(
      makeInput({
        fileTree: [blob("package.json"), blob("src/index.ts")],
        files: [
          { path: "package.json", content: `{ not valid json` },
          { path: "src/index.ts", content: `export const a = 1` },
        ],
      }),
    )
    // The bad manifest is noted, not thrown on; ingestion still completes.
    expect(result.notes.some((n) => n.includes("package.json"))).toBe(true)
    expect(result.entryPoints.map((e) => e.path)).toContain("src/index.ts")
  })

  it("is deterministic — the same snapshot yields the same result", () => {
    const input = makeInput({
      fileTree: [
        blob("src/index.ts"),
        blob("src/util.ts"),
        tree("src"),
        blob("package.json"),
      ],
      files: [
        manifest("package.json", { dependencies: { next: "16.0.0" } }),
        {
          path: "src/index.ts",
          content: `import { u } from "./util"\nimport "react"`,
        },
        { path: "src/util.ts", content: `export const u = 1` },
      ],
    })
    expect(ingestSnapshot(input)).toEqual(ingestSnapshot(input))
  })

  it("carries the snapshot identity onto the result", () => {
    const result = ingestSnapshot(
      makeInput({ owner: "vercel", repo: "next.js", ref: "canary" }),
    )
    expect(result.repo).toEqual({
      owner: "vercel",
      repo: "next.js",
      ref: "canary",
      commitSha: "c-main",
    })
  })
})

// --------------------------------------------------------------------------
// ingestSnapshotForRepo — M11 data-access integration
// --------------------------------------------------------------------------

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

/** Seed a snapshot row, return its generated id. */
function seedSnapshot(
  db: CatalogDb,
  overrides: Partial<NewRepoSnapshot> = {},
): number {
  const base: NewRepoSnapshot = {
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
      blob("package.json"),
      blob("src/index.ts"),
      blob("src/util.ts"),
    ],
    ...overrides,
  }
  const [row] = db.insert(repoSnapshots).values(base).returning().all()
  return row!.id
}

/** Seed a repo_files row. */
function seedFile(
  db: CatalogDb,
  snapshotId: number,
  filePath: string,
  content: string,
  category = "package-manifest",
): void {
  const file: NewRepoFile = {
    snapshotId,
    path: filePath,
    sha: `sha-${filePath}`,
    size: content.length,
    content,
    category,
  }
  db.insert(repoFiles).values(file).run()
}

describe("ingestSnapshotForRepo", () => {
  let db: CatalogDb

  beforeEach(() => {
    db = makeTestDb()
  })

  it("returns null when no snapshot matches the repo", async () => {
    const result = await ingestSnapshotForRepo("ghost", "repo", "main", db)
    expect(result).toBeNull()
  })

  it("ingests a snapshot read through the M11 data-access layer", async () => {
    const id = seedSnapshot(db)
    seedFile(
      db,
      id,
      "package.json",
      JSON.stringify({ name: "widgets", dependencies: { next: "16.0.0" } }),
    )
    seedFile(
      db,
      id,
      "src/index.ts",
      `import { u } from "./util"\nimport "react"`,
      "build-config",
    )

    const result = await ingestSnapshotForRepo("acme", "widgets", "main", db)
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.repo.owner).toBe("acme")
    expect(result.frameworks.map((f) => f.name)).toContain("Next.js")
    // The file tree came from repo_snapshots.file_tree.
    expect(result.fileTree.children.map((c) => c.name)).toContain("src")
    // Imports were parsed from the imported repo_files content.
    const edge = result.graph.edges.find((e) => e.from === "src/index.ts")
    expect(edge?.to).toBe("src/util.ts")
  })

  it("ingests a present snapshot with no imported key files", async () => {
    // Snapshot row exists, but repo_files is empty — the sparse case.
    seedSnapshot(db, { fileTree: [blob("src/index.ts")] })
    const result = await ingestSnapshotForRepo("acme", "widgets", "main", db)
    expect(result).not.toBeNull()
    if (!result) return
    // The src file is known from the tree but unscanned (no content).
    const module = result.graph.modules.find(
      (m) => m.path === "src/index.ts",
    )
    expect(module?.scanned).toBe(false)
    expect(
      result.notes.some((n) => n.includes("none had imported content")),
    ).toBe(true)
  })
})
