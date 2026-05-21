// Unit tests for key-file selection (Issue #39, PRD FR-2). Pure logic — no
// network, no DB. Verifies which tree entries count as "key" and why.

import { describe, expect, it } from "vitest"

import type { TreeEntry } from "./client"
import {
  classifyKeyFile,
  MAX_KEY_FILE_BYTES,
  selectKeyFiles,
} from "./key-files"

/** Build a blob tree entry with a default size. */
function blob(path: string, size = 100): TreeEntry {
  return { path, type: "blob", sha: `sha-${path}`, size }
}

/** Build a directory (tree) entry. */
function dir(path: string): TreeEntry {
  return { path, type: "tree", sha: `sha-${path}` }
}

describe("classifyKeyFile", () => {
  it("classifies package.json as package-manifest", () => {
    expect(classifyKeyFile(blob("package.json"))).toBe("package-manifest")
    expect(classifyKeyFile(blob("apps/web/package.json"))).toBe(
      "package-manifest",
    )
  })

  it("classifies lockfiles for every package manager", () => {
    expect(classifyKeyFile(blob("pnpm-lock.yaml"))).toBe("lockfile")
    expect(classifyKeyFile(blob("package-lock.json"))).toBe("lockfile")
    expect(classifyKeyFile(blob("yarn.lock"))).toBe("lockfile")
    expect(classifyKeyFile(blob("bun.lockb"))).toBe("lockfile")
  })

  it("classifies tsconfig.json and tsconfig variants as build-config", () => {
    expect(classifyKeyFile(blob("tsconfig.json"))).toBe("build-config")
    expect(classifyKeyFile(blob("packages/ui/tsconfig.json"))).toBe(
      "build-config",
    )
    expect(classifyKeyFile(blob("tsconfig.base.json"))).toBe("build-config")
  })

  it("classifies framework config across extensions as build-config", () => {
    expect(classifyKeyFile(blob("next.config.js"))).toBe("build-config")
    expect(classifyKeyFile(blob("next.config.mjs"))).toBe("build-config")
    expect(classifyKeyFile(blob("next.config.ts"))).toBe("build-config")
    expect(classifyKeyFile(blob("vite.config.ts"))).toBe("build-config")
    expect(classifyKeyFile(blob("apps/web/tailwind.config.ts"))).toBe(
      "build-config",
    )
    expect(classifyKeyFile(blob("drizzle.config.ts"))).toBe("build-config")
  })

  it("classifies turbo.json and pnpm-workspace.yaml as build-config", () => {
    expect(classifyKeyFile(blob("turbo.json"))).toBe("build-config")
    expect(classifyKeyFile(blob("pnpm-workspace.yaml"))).toBe("build-config")
  })

  it("classifies a root or workspace-root README as readme", () => {
    expect(classifyKeyFile(blob("README.md"))).toBe("readme")
    expect(classifyKeyFile(blob("readme"))).toBe("readme")
    expect(classifyKeyFile(blob("packages/db/README.md"))).toBe("readme")
  })

  it("does NOT treat a deeply-nested README as a key file", () => {
    expect(classifyKeyFile(blob("docs/guides/setup/README.md"))).toBeNull()
    expect(classifyKeyFile(blob("a/b/c/README.md"))).toBeNull()
  })

  it("classifies CI workflow files under .github/workflows", () => {
    expect(classifyKeyFile(blob(".github/workflows/ci.yml"))).toBe(
      "ci-workflow",
    )
    expect(classifyKeyFile(blob(".github/workflows/release.yaml"))).toBe(
      "ci-workflow",
    )
  })

  it("does NOT treat non-workflow .github files as CI workflows", () => {
    expect(
      classifyKeyFile(blob(".github/ISSUE_TEMPLATE/bug.yml")),
    ).toBeNull()
    expect(classifyKeyFile(blob(".github/dependabot.yml"))).toBeNull()
  })

  it("returns null for ordinary source files", () => {
    expect(classifyKeyFile(blob("src/index.ts"))).toBeNull()
    expect(classifyKeyFile(blob("apps/web/app/page.tsx"))).toBeNull()
    expect(classifyKeyFile(blob("LICENSE"))).toBeNull()
  })

  it("returns null for directory entries even with a key-file-like name", () => {
    expect(classifyKeyFile(dir("package.json"))).toBeNull()
    expect(classifyKeyFile(dir(".github/workflows"))).toBeNull()
  })
})

describe("selectKeyFiles", () => {
  const tree: TreeEntry[] = [
    blob("package.json", 1200),
    blob("pnpm-lock.yaml", 40_000),
    blob("turbo.json", 300),
    blob("tsconfig.json", 500),
    blob("README.md", 2000),
    dir("apps"),
    blob("apps/web/package.json", 800),
    blob("apps/web/next.config.mjs", 200),
    blob(".github/workflows/ci.yml", 1500),
    blob("src/index.ts", 5000),
    blob("docs/internal/README.md", 900),
  ]

  it("selects every key file and tags each with a category", () => {
    const selected = selectKeyFiles(tree)
    const paths = selected.map((s) => s.entry.path)
    expect(paths).toEqual([
      "package.json",
      "pnpm-lock.yaml",
      "turbo.json",
      "tsconfig.json",
      "README.md",
      "apps/web/package.json",
      "apps/web/next.config.mjs",
      ".github/workflows/ci.yml",
    ])
    const byPath = new Map(selected.map((s) => [s.entry.path, s.category]))
    expect(byPath.get("package.json")).toBe("package-manifest")
    expect(byPath.get("pnpm-lock.yaml")).toBe("lockfile")
    expect(byPath.get("turbo.json")).toBe("build-config")
    expect(byPath.get(".github/workflows/ci.yml")).toBe("ci-workflow")
    expect(byPath.get("README.md")).toBe("readme")
  })

  it("excludes ordinary source files and deeply-nested READMEs", () => {
    const paths = selectKeyFiles(tree).map((s) => s.entry.path)
    expect(paths).not.toContain("src/index.ts")
    expect(paths).not.toContain("docs/internal/README.md")
  })

  it("preserves the input tree order", () => {
    const selected = selectKeyFiles(tree)
    expect(selected[0]?.entry.path).toBe("package.json")
    expect(selected[selected.length - 1]?.entry.path).toBe(
      ".github/workflows/ci.yml",
    )
  })

  it("skips a key file larger than MAX_KEY_FILE_BYTES (size-aware)", () => {
    const huge: TreeEntry[] = [
      blob("package.json", 100),
      blob("pnpm-lock.yaml", MAX_KEY_FILE_BYTES + 1),
    ]
    const paths = selectKeyFiles(huge).map((s) => s.entry.path)
    expect(paths).toEqual(["package.json"])
  })

  it("keeps a key file exactly at the size limit", () => {
    const atLimit = [blob("package.json", MAX_KEY_FILE_BYTES)]
    expect(selectKeyFiles(atLimit)).toHaveLength(1)
  })

  it("returns an empty list for a tree with no key files", () => {
    expect(selectKeyFiles([blob("src/a.ts"), dir("src")])).toEqual([])
  })
})
