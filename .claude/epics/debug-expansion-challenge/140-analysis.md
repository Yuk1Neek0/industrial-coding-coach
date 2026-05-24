---
issue: 140
title: challenges + challenge_attempts schema + Drizzle migration + data-access layer
analyzed: 2026-05-24T22:15:00Z
estimated_hours: 10
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #140

## Overview

Two new tables (`challenges` + `challenge_attempts`) with JSON columns, one Drizzle migration, and a typed data-access module that #142 (generation) and #143 (grading) both consume. Single-stream task — schema/migration/DAL ship together; splitting would just add interface design overhead.

## Parallel Streams

### Stream A: schema + migration + DAL + tests
**Scope**: `packages/db/src/schema.ts` (additive — two new tables), generated Drizzle migration under `packages/db/drizzle/`, new `packages/db/src/challenges/` module with create/read of challenges and attempts plus latest-outcome retrieval, tests covering CRUD round-trips and multi-attempt sequences (US-6).
**Files**: `packages/db/src/schema.ts`, `packages/db/drizzle/<NNNN>_*.sql` + meta, `packages/db/src/challenges/`, tests.
**Can Start**: now (depends_on []).
**Estimated Hours**: 10.

## Coordination Points

- Migration numbering follows what's current in `packages/db/drizzle/` — use `drizzle-kit generate` to auto-pick the next index. M7 #131 added `0007_*`; expect `0008_*` here, but verify by reading the latest journal.
- No file conflicts with M7 work (M7 lives in `packages/db/src/learning-units/` + `packages/db/src/github/`; M9 is `packages/db/src/challenges/`). Both edit `packages/db/src/schema.ts` additively — coordinate at epic merge time, not now.

## Notes for the implementing agent

- Follow the `stack_explanations` / `diff_reviews` / `project_maps` / `learning_units` (M7 #131 just landed) conventions in `packages/db/src/schema.ts`. Read all of them first.
- `challenges` keyed by snapshot + challenge type + id (for R2 lazy-per-type caching).
- `challenge_attempts` keyed by challenge id with timestamp (multiple attempts per US-6).
- All structured fields as JSON columns (`text({ mode: 'json' })`).
- DAL is server-side only; no UI imports.
- Test posture: no live API or GitHub calls in CI.
