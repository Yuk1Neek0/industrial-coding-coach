---
issue: 131
title: learning_units schema + Drizzle migration
analyzed: 2026-05-24T20:48:00Z
estimated_hours: 5
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #131

## Overview

Add a single `learning_units` table to the existing SQLite database (ADR
0006) and a Drizzle migration for it, plus the schema test that asserts
columns and types. The table mirrors M6 `project_maps` (key-file map,
flows) and M8 `diff_reviews` (review + grading) — single row per
imported issue, JSON columns for list-valued and user-mutable state
(R2). Stub-only challenge fields per R3.

Single-stream task. The work lives in one package (`packages/db`) and
in three coupled files (`schema.ts`, generated migration under
`packages/db/drizzle/`, the schema test). Splitting into streams would
add coordination overhead without delivering parallel throughput, so
this task ships as one agent / one branch.

## Parallel Streams

### Stream A: schema + migration + test
**Scope**: Define the `learning_units` table in
`packages/db/src/schema.ts`, generate the corresponding Drizzle
migration under `packages/db/drizzle/`, export typed insert/select
helpers consistent with `project_maps` / `diff_reviews`, and write
`packages/db/src/learning-units-schema.test.ts` (or equivalent)
mirroring the existing schema tests.
**Files**:
- `packages/db/src/schema.ts` (additive — new table only)
- `packages/db/drizzle/<NNNN>_*.sql` and the meta journal (new migration)
- `packages/db/src/learning-units-schema.test.ts` (new)
**Can Start**: immediately
**Estimated Hours**: 5
**Dependencies**: none (in-epic)

## Coordination Points

### Shared Files
- `packages/db/src/schema.ts` — only this task edits it during M7's
  Wave 1. M7 task 132 (issue fetching) and the M9 epic both touch
  unrelated areas (`packages/db/src/github/` and the M9
  `packages/db/src/challenges/` module respectively); no concurrent
  writers expected within this worktree.

### Sequential Requirements
- Migration numbering follows whatever sequence is current in
  `packages/db/drizzle/`. Generate via `pnpm drizzle-kit generate` so
  Drizzle picks the next index automatically (do not hand-number).

## Conflict Risk Assessment

Low. `schema.ts` is additive (new table appended). The Drizzle
migration is a new file. The test file is new. No edits to existing
code. No package.json changes (Drizzle and SQLite are already
installed; see ADR 0006).

## Parallelization Strategy

None. One agent does the full task on a single branch off
`epic/issue-based-learning-workspace`.

## Expected Timeline

- With parallel execution: 5h wall time (same as serial — single stream)
- Without: 5h
- Efficiency gain: 0% (no parallel work to extract)

## Notes for the implementing agent

- Mirror **column shape** from `project_maps` (M6) and `diff_reviews`
  (M8) closely — use `text({ mode: 'json' })` for JSON columns, an
  integer autoincrement `id` primary key, and `integer({ mode:
  'timestamp' })` for `created_at` / `updated_at`.
- The `source` column is an `enum`: `'github-issue' | 'ccpm-task'`
  (R1).
- Only the **stub** challenge columns are in scope: `challenge_concept`
  (text, nullable) and `challenge_type` (text, nullable). M9 will land
  the full challenge schema in its own migration — do **not**
  pre-allocate M9 columns (R3).
- User-mutable JSON columns (`user_answers`, `score`, `weak_areas`,
  `checklist_state`) are nullable until populated.
- Use `pnpm --filter @workspace/db ...` (or the equivalent workspace
  filter the repo uses) to scope Drizzle commands.
- After generating the migration, run `pnpm typecheck` and `pnpm test`
  from the repo root to verify.
- Do not run `pnpm db:migrate` against any real database — the
  migration only needs to *generate* and *apply* cleanly in the test
  harness.
