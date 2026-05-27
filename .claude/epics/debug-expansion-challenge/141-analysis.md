---
issue: 141
title: File-reference integrity check module + tests
analyzed: 2026-05-24T22:15:00Z
estimated_hours: 6
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #141

## Overview

A pure, synchronous validator that rejects any challenge or grading-output file/module reference that isn't in the M6 project map (R8 + FR-6). Used by both #142 (generation) and #143 (grading). Single-stream — one module, one set of tests.

## Parallel Streams

### Stream A: integrity check module + tests
**Scope**: new typed module under `packages/db/src/challenges/integrity-check.ts` (or sibling to the #140 DAL) exposing one function `verifyChallengeIntegrity(candidate, projectMap)` returning `{ ok, unresolved }`. Tests cover: valid challenge, out-of-scope reference rejected, adjacent-but-unmapped file rejected, fabricated grading reference rejected, minimal map handled gracefully.
**Files**: `packages/db/src/challenges/integrity-check.ts`, `packages/db/src/challenges/integrity-check.test.ts`.
**Can Start**: now (depends_on []).
**Estimated Hours**: 6.

## Coordination Points

- Lives under `packages/db/src/challenges/` — same directory as #140's DAL. **Different filenames** (DAL exports vs `integrity-check.ts`); no file conflict. Both tasks can run in parallel.
- Authoritative reference set is the **M6 project map**, not the raw snapshot file tree. R8 binds M9 to map-named files only.

## Notes for the implementing agent

- Read the M6 project-map data-access layer to understand the project-map shape.
- Mirror the structure of M7's `verifyLearningUnitIntegrity` (in flight on #135) — pure, synchronous, returns a typed result rather than throws.
- **No adjacent-file inference** (R8): a path is accepted iff the M6 project map explicitly names it.
- Test posture: no live API or GitHub calls in CI.
