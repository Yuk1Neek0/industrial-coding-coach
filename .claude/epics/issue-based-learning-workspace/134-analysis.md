---
issue: 134
title: Understanding-check grading call + mocked tests
analyzed: 2026-05-25T00:35:00Z
estimated_hours: 10
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #134

## Overview

Second bounded Anthropic SDK call for M7: takes the typed `UnderstandingQuestion[]` shape exported by #133 plus the user's answers and produces a numeric `Score` + `WeakArea[]` matching M8's grading shape (FR-5, NFR Fair grading). Separation from generation is normative (questions locked before grading). Single-stream task.

## Parallel Streams

### Stream A: grading call + mocked tests
**Scope**: bounded SDK call on `llm-foundation` exposing `gradeLearningUnit(questions, answers)`. Structured output `{ score: Score, weakAreas: WeakArea[] }` — same shape as M8 `diff_reviews` grading. Persistence via `recordScore` from #135's DAL. Mocked tests.
**Files**: new module under `packages/db/src/learning-units/` (alongside `generate.ts` from #133) or `packages/ai/` — whichever pattern M8 used.
**Can Start**: now (depends_on [133] satisfied; conflicts_with [133, 135] both done).
**Estimated Hours**: 10.

## Coordination Points

- Consumes `UnderstandingQuestion[]` typed shape exported by #133 from `packages/db/src/learning-units/index.ts` (just shipped).
- Reuses M8's grading prompt template / schema so M7 + M8 produce one comprehension-grading pattern (NFR Fair grading). Cite M8 by archived path.
- Persists via `recordScore` from #135.
- R6 normative: strictly per-unit; no cross-unit aggregate.

## Notes for the implementing agent

- ADR 0005: bounded SDK call on `llm-foundation` — not LangChain, not an autonomous agent.
- Mirror M8's grading call (`.claude/epics/archived/diff-review/113.md` + the shipped grading code in `packages/db/src/diff/` or `packages/ai/`).
- Score shape: `{ value: number, max: number }` or `{ score: number }` — match M8 exactly. Don't redefine.
- WeakArea shape: same as M8's.
- Graceful handling of empty answers (zero score with "no answer provided" weak-area entry); never throws on missing answers (NFR Resilient).
- Test posture: mocked / recorded SDK responses; CI has no API key.
