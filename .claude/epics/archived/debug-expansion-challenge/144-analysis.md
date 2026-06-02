---
issue: 144
title: Challenge List Page Spec + Claude Design prompt
analyzed: 2026-05-24T22:15:00Z
estimated_hours: 5
parallelization_factor: 1.0
---

# Parallel Work Analysis: Issue #144

## Overview

Page Spec + Claude Design prompt for the M9 Challenge List Page. Docs-only; no code. Per ADR 0007.

## Parallel Streams

### Stream A: Page Spec + prompt
**Files**: `docs/design/challenge-list-page.md`, `docs/design/ui-prompts/challenge-list-page.md`.
**Can Start**: now.
**Estimated Hours**: 5.

## Coordination Points

- #145, #146, #147 also write under `docs/design/` — all different filenames. No file conflict.

## Notes for the implementing agent

- **Claude Design only (ADR 0007)** — never "v0".
- Each list entry names target file(s)/module(s) from the M6 project map (US-1); generic challenges without file refs are not shown.
- Challenge types that don't apply are **omitted, not faked** (R1 / FR-2), including the broken-CI type when no real failing CI run is available (R6).
- Each entry surfaces the user's latest 0–100 outcome (R4 / R5) as the current status.
- Lazy-per-type generation behavior (R2) is **server-side**: list view doesn't trigger generation on render; opening the Detail Page does.
- Follow `docs/design/` Page Spec conventions from M4/M5/M6/M8.
