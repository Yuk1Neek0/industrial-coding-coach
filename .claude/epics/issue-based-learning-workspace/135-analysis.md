---
issue: 135
title: learning_units data-access layer + file-reference integrity check
analyzed: 2026-05-24T22:15:00Z
estimated_hours: 9
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #135

## Overview

Build the typed data-access module for `learning_units` (create/read/update unit + JSON-column user state per R2/R4) and ship the reusable file-reference integrity check (FR-4) that #133 (generation) and #138 (integration) both call. Single-stream task: the DAL and the integrity check are tightly coupled (same module, same typed `LearningUnit` shape) and have no internal sub-streams worth splitting.

## Parallel Streams

### Stream A: Data-access layer + integrity check + tests
**Scope**:
- `packages/db/src/learning-units/index.ts` (or directory) exporting `createLearningUnit`, `getLearningUnit`, `updateLearningUnit`, `recordAnswers`, `recordScore`, `updateChecklistState`.
- Reusable `verifyLearningUnitIntegrity(unit, snapshotFiles, projectMap?)` (FR-4) — pure synchronous validator returning `{ ok, unresolved }`.
- Tests under `packages/db/src/learning-units/*.test.ts` covering CRUD round-trips and integrity rejection cases.
**Files**: new module under `packages/db/src/learning-units/` (additive).
**Can Start**: now (depends_on [131] done).
**Estimated Hours**: 9.

## Coordination Points

- conflicts_with [133, 134]: this task touches the `LearningUnit`, `UserAnswer`, `Score`, `WeakArea` typed shapes that #133 and #134 also use. **Must not run in parallel with #133 or #134.** #133 / #134 are still locked (depend on #132 → #133 → #134 chain); no concurrent risk.

## Conflict Risk Assessment

Low. Touches only `packages/db/src/learning-units/` (new module). No schema edits (#131 owns those).

## Notes for the implementing agent

- Mirror the M6 `packages/db/src/mapper/` and M8 `packages/db/src/diff/` modules.
- The integrity check is pure / synchronous; callers supply the snapshot file set and the optional project map.
- Per R4 the DAL does **not** gate scoring on checklist completion — it just persists `checklist_state`.
- Per R6 the DAL ships strictly per-unit scoring — no cross-unit aggregates.
- `verifyLearningUnitIntegrity` must be exported from the module's barrel so #133 (generator boundary) and #138 (integration boundary) can both import it.
- Test posture: no live API or GitHub calls in CI.
