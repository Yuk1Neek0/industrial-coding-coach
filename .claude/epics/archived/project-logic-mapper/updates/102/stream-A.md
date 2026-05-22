---
issue: 102
stream: schema
started: 2026-05-22T15:10:00Z
status: completed
---

# Issue #102 — project_maps schema + Drizzle migration

## Stream A — schema

### Plan
- Add `project_maps` table to `packages/db/src/schema.ts`, mirroring the
  `stack_explanations` pattern: child of `repo_snapshots`, cascade-deleted,
  unique per snapshot.
- Columns cover all seven outputs: architecture overview, key-file map,
  request/data flow, state flow, AI-call flow, Mermaid diagram source,
  debug path. Structured/list-valued fields are JSON columns.
- Export `ProjectMap` / `NewProjectMap` types.
- Generate the Drizzle migration via `pnpm --filter @workspace/db db:generate`.
- Verify with `pnpm typecheck` and `pnpm test`.

### Scope
- `packages/db/src/schema.ts` (additive only)
- `packages/db/drizzle/` (new migration + meta)

### Progress
- Read task + existing schema. `stack_explanations` is the pattern to mirror.
- Added `project_maps` table to `packages/db/src/schema.ts` (additive only;
  no existing tables reordered/reformatted). Child of `repo_snapshots`,
  `onDelete: cascade`, `uniqueIndex` on `snapshot_id`. Columns cover all
  seven outputs; structured sections are JSON columns; `mermaid_diagram`
  is a plain text column. Helper interfaces `ArchitectureSection`,
  `ProjectMapFile`, `FlowStep`, `DebugPathStep`. Exported `ProjectMap` /
  `NewProjectMap` types.
- Generated migration `drizzle/0005_vengeful_beast.sql` (+ `0005_snapshot.json`,
  `_journal.json` update) via `pnpm db:generate`.
- Added `packages/db/src/project-map-schema.test.ts` (4 tests: JSON
  round-trip, one-map-per-snapshot uniqueness, FK requires snapshot,
  cascade delete) — mirrors `snapshot-schema.test.ts`.

### Verification
- `pnpm typecheck` — 4/4 packages pass.
- `pnpm test` — db 208 tests pass (incl. 4 new), ai 18 tests pass.

### Files changed
- `packages/db/src/schema.ts` (additive)
- `packages/db/src/project-map-schema.test.ts` (new)
- `packages/db/drizzle/0005_vengeful_beast.sql` (new)
- `packages/db/drizzle/meta/0005_snapshot.json` (new)
- `packages/db/drizzle/meta/_journal.json` (updated)

### Notes
- No files outside scope touched.
- Migration is numbered `0005`; collision with the parallel diff-review
  epic is resolved at epic merge time per task instructions.

Status: completed.
