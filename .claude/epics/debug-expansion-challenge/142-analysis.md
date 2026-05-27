---
issue: 142
title: Generation SDK call (lazy-per-type, cached) + mocked tests
analyzed: 2026-05-24T23:30:00Z
estimated_hours: 16
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #142

## Overview

Build the bounded Anthropic SDK call (ADR 0005) that generates a project-tied challenge from the M6 project map and M11 snapshot. **Lazy per challenge type, cached per snapshot** in the `challenges` table from #140 (R2 / FR-1); subsequent opens read the cached row rather than re-calling the SDK. Emits at-least-one challenge per applicable type (R1 / FR-2); broken-CI type gated on real failing CI (R6). Calls `verifyChallengeIntegrity` from #141 before persisting (R8 + FR-6). Mocked tests per `llm-foundation`. Single-stream task.

## Parallel Streams

### Stream A: generation call (lazy-per-type, cached) + broken-CI gating + integrity check + tests
**Scope**: bounded SDK call producing a typed challenge (type, task description, in/out-of-scope file sets, acceptance criteria, source references), cache via #140's DAL (`packages/db/src/challenges/`), call `verifyChallengeIntegrity` (#141) before persist, broken-CI type-selection gating inside the candidate-selection step, mocked tests.
**Files**: new module under `packages/ai/` (or matching the M8 `diff-review` consumer placement).
**Can Start**: now (depends_on [140, 141] both done).
**Estimated Hours**: 16.

## Coordination Points

- conflicts_with [143]: shares mutation surface on `challenge_attempts.grading_result` (which #143 writes). #143 is still blocked. **Safe to run alone.**
- Consumes #140's `Challenge` / `ChallengeContent` typed shapes (DAL).
- Calls `verifyChallengeIntegrity` from #141 — must resolve via the same module path #141 ships (`packages/db/src/challenges/integrity-check.ts`).
- Reads via M6 project-map DAL + M11 snapshot DAL.

## Notes for the implementing agent

- ADR 0005 normative: bounded SDK call on `llm-foundation` — **not LangChain, not an autonomous agent**.
- R2 normative: **lazy per challenge type, cached per snapshot**. First open of a category triggers generation + persists via #140's DAL. Subsequent opens read the cached row. **A "new challenge" action re-invokes generation for the same type** (handle via an explicit force-regenerate flag on the function signature).
- R1 normative: emit at-least-one challenge per **applicable** type. Types that don't apply are skipped (not faked).
- R6 normative: the "explain a broken CI result" type is gated at the type-selection step — emit only if the M11 snapshot exposes a real failing CI run / log. Until M11 surfaces those, this type is expected to be absent. **Gating logic lives inside this task's type-selection step (a few lines on top of selection), not a separate task.**
- R8 normative: in-scope and out-of-scope file sets are strictly limited to M6 project-map-named files. The integrity check from #141 enforces this.
- Test posture: mocked / recorded SDK responses; no live API or GitHub calls in CI.
- The exported `Challenge` typed shape (already shipped by #140) is the input contract for #143's grading call.
