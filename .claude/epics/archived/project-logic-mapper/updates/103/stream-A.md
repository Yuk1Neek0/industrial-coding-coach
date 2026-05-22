---
issue: 103
stream: ingestion
started: 2026-05-22T16:23:15Z
status: completed
---

# Issue #103 — Deterministic ingestion module

## Stream: ingestion

## Scope
Deterministic ingestion module under `packages/db/src/mapper/` that turns an
imported M11 snapshot into a typed structure: file tree, module/dependency
graph, import relationships. Pure — no LLM, no network. Reuses the M5
stack-detection output (`packages/db/src/stack`) for frameworks/entry points.

## Files
- `packages/db/src/mapper/imports.ts` — pure import/require/dynamic-import
  parser (`parseImports`, `isParseableSource`).
- `packages/db/src/mapper/ingest.ts` — `ingestSnapshot` (pure) +
  `ingestSnapshotForRepo` (M11 data-access convenience). Builds the file tree,
  the module/dependency graph (resolved relative edges, external-package
  aggregation), and reuses M5 `detectStack` for frameworks + entry points.
- `packages/db/src/mapper/index.ts` — barrel.
- `packages/db/src/mapper/imports.test.ts` — 12 parser tests.
- `packages/db/src/mapper/ingest.test.ts` — 22 ingestion tests, incl. the
  no-clear-entry-point case and the M11 in-memory-DB integration path.

## Cross-scope edits
- `packages/db/src/index.ts` — added `export * from "./mapper"`. Checked
  `git status` first; was clean. Task 102 owns `schema.ts` only, no conflict.
- `packages/db/package.json` — added `"./mapper"` export entry. Checked
  `git status` first; was clean.

## Verification
- `pnpm --filter @workspace/db typecheck` — pass.
- `pnpm typecheck` (repo-wide) — pass (4/4 tasks).
- `pnpm --filter @workspace/db test` — 245 passed (20 files), incl. 34 new
  mapper tests.
- `pnpm --filter @workspace/db lint` — clean.

## Acceptance criteria
- [x] Reads a snapshot via the M11 data-access layer and produces a typed
      structure: file tree, module/dependency graph, import relationships.
- [x] Reuses M5 stack-detection output for frameworks and entry points — no
      re-detection (calls `detectStack`; framework conventions gated on it).
- [x] Pure and deterministic — no LLM calls, no network.
- [x] Unit tests cover representative snapshots, incl. a no-clear-entry-point
      snapshot.
- [x] `pnpm typecheck` and `pnpm test` pass.

## Notes / risks
- Migration numbering / `project_maps` table is task 102's scope — not touched.
- Import parsing is a conservative regex scan (no full AST) by design: it
  reasons over module dependencies, degrades gracefully, never throws.
