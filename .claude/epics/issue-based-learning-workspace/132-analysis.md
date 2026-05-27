---
issue: 132
title: Issue fetching in M11 GitHub client + CCPM-task adapter + normalized input + tests
analyzed: 2026-05-24T21:05:00Z
estimated_hours: 14
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #132

## Overview

Extend the shipped M11 GitHub client at `packages/db/src/github/` with read-only **issue** endpoints, build a **CCPM-task local adapter** that reads `.claude/epics/<epic>/<task>.md` files from the imported snapshot, and ship a typed **normalized `LearningUnitInput` shape** that folds both inputs into one (R1 / FR-1). All on a single bounded backend module; mocked-response tests; no live GitHub calls in CI.

Single-stream task. Issue endpoints, the CCPM-task adapter, and the normalized shape are all under the same module (`packages/db/src/github/`) and depend on each other (the adapter and the normalized shape consume the typed issue-fetch result). Splitting into sub-streams would force premature interface design between modules that ship together; one agent on one branch is the right shape.

## Parallel Streams

### Stream A: GitHub-client issue extension + CCPM-task adapter + normalized input + tests
**Scope**:
- Add `fetchIssue` / `listIssues` endpoints to `packages/db/src/github/` (read-only, reuse existing auth + rate-limit handling, mirror M8 PR-fetch extension).
- Build `packages/db/src/github/ccpm-task-adapter.ts` reading `.claude/epics/<epic>/<task>.md` files via the M11 snapshot data-access layer.
- Export `LearningUnitInput` typed shape (`source: 'github-issue' | 'ccpm-task'` + stable `issueRef` + `title` / `body` / `labels` / `state` / `linkedPrs`) — the input contract for task #133's generation call.
- Mocked-response tests covering issue fetch (with body, without body, no linked PR), CCPM-task adapter (with tasks, without tasks), and normalization.
**Files**:
- `packages/db/src/github/` (additive — new endpoints and new module file(s))
- `packages/db/src/github/*.test.ts` (new tests)
**Can Start**: immediately
**Estimated Hours**: 14
**Dependencies**: none (in-epic); reads M11 / M8 shipped code

## Coordination Points

### Shared Files
- `packages/db/src/github/index.ts` (if it exists as the module's barrel) — only this task edits it during M7's Wave 1. No concurrent writers expected.

### Sequential Requirements
- The exported `LearningUnitInput` typed shape is the **input contract** for task #133 (generation call). It must be in place before #133 starts; #133's `depends_on: [132]` enforces this.

## Conflict Risk Assessment

Low. The work is additive to `packages/db/src/github/`. No edits to existing GitHub-client code (PR fetch from M8 stays intact). No package.json changes (Octokit / fetch / whatever is already installed by M8 / M11). No schema edits (task #131 owns those).

## Parallelization Strategy

None within this task. One agent does the full task on a single branch off `epic/issue-based-learning-workspace`.

## Expected Timeline

- With parallel execution: 14h wall time (same as serial — single stream)
- Without: 14h
- Efficiency gain: 0% (no parallel work to extract)

## Notes for the implementing agent

- **Mirror the M8 PR-fetch extension** exactly — read how M8 added `fetchPR` and friends to `packages/db/src/github/` and follow that style. The repo's M8 epic was archived; you can see it in `.claude/epics/archived/diff-review/` for reference.
- Read-only access only (ADR 0009). No issue creation, comments, edits, or closes.
- Reuse the existing `GITHUB_TOKEN` mechanism. Do **not** add a new auth path.
- CCPM-task adapter reads files via the **M11 snapshot data-access layer**, not the live filesystem — the unit must be snapshot-deterministic.
- Test posture: mocked / recorded responses only. CI runs with no `GITHUB_TOKEN` set. No live network access.
- Export the `LearningUnitInput` typed shape from `packages/db/src/github/index.ts` (or wherever the module's barrel lives) so task #133 can import it.
