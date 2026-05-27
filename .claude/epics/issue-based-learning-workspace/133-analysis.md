---
issue: 133
title: Generation call via Anthropic SDK + tool use + integrity check + mocked tests
analyzed: 2026-05-24T23:30:00Z
estimated_hours: 16
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #133

## Overview

Build the bounded Anthropic SDK call (ADR 0005) that produces the typed seven-part learning unit, with tool use to read snapshot files (M11 DAL) and M6 project-map entries. Call `verifyLearningUnitIntegrity` from #135 at the generator boundary so the unit is rejected if file references don't resolve (FR-4). Tested with mocked / recorded SDK responses per `llm-foundation`. Single-stream task — the generation call, tool wiring, structured-output schema, and tests ship together.

## Parallel Streams

### Stream A: generation call + tool use + integrity check + tests
**Scope**: bounded SDK call in `packages/ai/` (or wherever the `llm-foundation` consumers live), tool definitions for `read_snapshot_file` and `read_project_map_node`, structured output matching the `learning_units` columns, integrity-check call before returning, mocked tests.
**Files**: new module under `packages/ai/` (or `packages/db/src/...` if that's where `llm-foundation` consumers live — read the M8 `diff-review` consumer first to confirm placement).
**Can Start**: now.
**Estimated Hours**: 16.

## Coordination Points

- conflicts_with [134, 135]: shares the `LearningUnit` / `Question[]` / `Score` / `WeakArea` typed shapes. #135 is now done (its types are in `packages/db/src/learning-units/`). #134 (grading) is still blocked. **Safe to run alone.**
- Calls into `verifyLearningUnitIntegrity` exported by `packages/db/src/learning-units/` (#135 just landed).
- Calls `read_snapshot_file` via the M11 snapshot DAL (shipped) and `read_project_map_node` via the M6 project-map DAL (shipped).

## Notes for the implementing agent

- ADR 0005 normative: bounded SDK call on `llm-foundation` — **not LangChain, not an autonomous agent**.
- Mirror the M8 `diff-review` review call (`.claude/epics/archived/diff-review/112.md` + the shipped `packages/ai/...` code).
- Structured output type matches the `learning_units` row columns exactly so persistence in #138 is mechanical.
- The exported `Question[]` typed shape is the input contract for #134's grading call — make it stable.
- Per NFR Resilient: graceful degradation on empty issue body / missing M6 map / unresolved snapshot files (emit explicit "none found" / "project map unavailable" annotations rather than throwing).
- Test posture: mocked / recorded SDK responses; no live API or GitHub calls in CI.
