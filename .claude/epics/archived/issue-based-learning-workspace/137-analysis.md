---
issue: 137
title: Per-repo Issues list Page Spec + Claude Design prompt
analyzed: 2026-05-24T21:05:00Z
estimated_hours: 5
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #137

## Overview

Author the **Page Spec** and the **Claude Design prompt** for the per-repo Issues list page (FR-11, R5) — the entry point off the M11 imported-repo page from which the user navigates to a learning unit. Docs-only; no code. Per ADR 0007.

Single-stream task. Two files (one spec + one prompt) for a single page. No internal sub-streams.

## Parallel Streams

### Stream A: Per-repo Issues list Page Spec + Claude Design prompt
**Scope**:
- `docs/design/per-repo-issues-list.page-spec.md` (route `apps/web/app/repos/[owner]/[repo]/issues/page.tsx`).
- `docs/design/ui-prompts/per-repo-issues-list.prompt.md`.
**Files**: 2 new files under `docs/design/`
**Can Start**: immediately
**Estimated Hours**: 5
**Dependencies**: none (in-epic); references the typed issue-list shape from #132 but doesn't require #132 to have shipped.

## Coordination Points

### Shared Files
- Task #136 also writes under `docs/design/` but for **different** files (the four sub-component specs). No overlap.

### Sequential Requirements
- None.

## Conflict Risk Assessment

Low. Both files are new and in their own paths.

## Parallelization Strategy

None within this task. Run alongside #132 and #136 in their own scratch worktrees.

## Expected Timeline

- With parallel execution: 5h wall time
- Without: 5h
- Efficiency gain: 0%

## Notes for the implementing agent

- **Claude Design only (ADR 0007)** — never v0.
- The Page Spec must explicitly state **R5**: this is per-repo only; **no global cross-repo issues index** exists in M7 (a global index, if ever needed, is a follow-up).
- Per-row "learning unit status" badge from `learning_units` table (#131): `not started | in progress | scored`.
- Surface labels, state (open / closed), and linked-PR indicators from the issue-fetch shape (#132).
- Cover the empty-repo case (no issues, no CCPM tasks) with an explicit empty state (NFR Resilient).
- Follow the existing `docs/design/` Page Spec conventions used by M4 / M5 / M6 / M8.
