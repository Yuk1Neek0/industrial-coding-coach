---
issue: 143
title: Grading SDK call (0-100, M8-shape, explanation-only) + mocked tests
analyzed: 2026-05-25T00:35:00Z
estimated_hours: 14
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #143

## Overview

Second bounded Anthropic SDK call for M9: grades the user's **explanation only** (R3, FR-7) against the challenge's acceptance criteria and the M6 project map. Output is a typed **0–100 score + weak-area breakdown matching M8's grading shape** (R4 / FR-5), with per-criterion results and a short feedback paragraph. Integrity-checked via #141 before persisting. Single-stream task.

## Parallel Streams

### Stream A: grading call + mocked tests
**Scope**: bounded SDK call on `llm-foundation` exposing `gradeChallenge(challenge, attempt)`. Output `{ score, perCriterion, weakAreas, feedback }` matching M8 weak-area schema and pass-threshold conventions. Persists via #140's DAL onto `challenge_attempts.grading_result`. Integrity check via #141. Mocked tests.
**Files**: new module under `packages/db/src/challenges/` (alongside `generation.ts` from #142) or `packages/ai/` — match where M8's grading call lives.
**Can Start**: now (depends_on [142] satisfied; conflicts_with [142] done).
**Estimated Hours**: 14.

## Coordination Points

- Consumes the typed `Challenge` + `ChallengeAttempt` shapes exported by #140 (DAL) and the challenge-content shape produced by #142's generation call.
- Persists onto `challenge_attempts.grading_result` via #140's DAL. Mutation surface shared with #142 (which writes generated challenges), hence the bidirectional `conflicts_with` between #142 and #143 — now safe since #142 is done.
- Integrity check from #141 — every grading output reference must resolve in the M6 project map (R8 + FR-6).

## Notes for the implementing agent

- ADR 0005: bounded SDK call on `llm-foundation` — not LangChain, not an autonomous agent.
- Mirror M8's grading call (`.claude/epics/archived/diff-review/113.md` + the shipped grading code) and the M7 grading call (#134, may be in flight). Don't redefine the score shape — reuse M8's.
- **R3 / FR-7 normative**: grade the user's **explanation only**. Snippets are illustrative — do NOT score for style / naming / plausibility. Widening this requires a new ADR.
- **R4 normative**: 0–100 score + weak-area breakdown matching M8 exactly. Pass threshold + weak-area schema shared with M8 — cite M8 path; do not redefine.
- **FR-7**: do not execute, build, lint, or test user code. Do not claim "this passes".
- **NFR Resilient**: graceful on very short / empty / off-topic submissions — return low score with clear feedback; never crash.
- Integrity-check every grading output before persist (R8 / FR-6).
- Test posture: mocked / recorded SDK responses; CI has no API key.
