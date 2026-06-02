---
issue: 146
title: Debug Walkthrough UI Page Spec + Claude Design prompt
analyzed: 2026-05-24T22:15:00Z
estimated_hours: 5
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #146

## Overview

Page Spec + Claude Design prompt for the Debug Walkthrough UI — the answer-entry surface where the user submits a free-text explanation (US-3 / FR-4). Docs-only.

## Parallel Streams

### Stream A: Page Spec + prompt
**Files**: `docs/design/debug-walkthrough-ui.md`, `docs/design/ui-prompts/debug-walkthrough-ui.md`.
**Can Start**: now.
**Estimated Hours**: 5.

## Coordination Points

- Host route resolved by #145 (Detail Page spec); reference #145's resolution rather than redefining.
- Adjacent to #147 (Completion Review UI); both render off the same `challenge_attempts` data.

## Notes for the implementing agent

- **Claude Design only (ADR 0007)** — never "v0".
- R3 / FR-7 normative: grading is over the user's **explanation only**. Snippets are illustrative; the grader does NOT score snippet style/naming/plausibility. **Surface this to the user** (inline note near the snippet field) so they're not misled.
- Free-text explanation is the primary input.
- Optional per-file snippets keyed to **M6 map-named paths only** (R8 / FR-4) — the file-path picker is restricted, not free-typed.
- Active challenge's in-scope / out-of-scope sets visible while answering (R8).
- Follow `docs/design/` Page Spec conventions from M4/M5/M6/M8.
