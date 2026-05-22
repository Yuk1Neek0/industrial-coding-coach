---
name: recommendation-engine
status: backlog
created: 2026-05-22T00:20:11Z
updated: 2026-05-22T00:24:36Z
progress: 0%
prd: .claude/prds/recommendation-engine.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/76
---

# Epic: recommendation-engine

## Overview

Milestone 4. Build a hybrid recommendation engine that turns a junior dev's
intake context into a recommended Golden Path and template set. A deterministic,
unit-tested scoring layer ranks candidates against the M2 catalog and M3
registry fit-data and decides the recommendation; a bounded Anthropic SDK call
(per ADR 0005), built on the `llm-foundation` client, generates the human-facing
coaching narrative. Results persist to the existing catalog SQLite database, and
the intake and result UIs are produced through the Claude Design round-trip.

## Architecture Decisions

- **LLM mechanism fixed by ADR 0005** — the Anthropic SDK directly (bounded
  prompt → structured output, prompt caching, tool use). No agent framework, no
  LangChain. No new ADR.
- **Reuse the catalog SQLite database (ADR 0006)** — add one `recommendations`
  table via a Drizzle migration. No new database.
- **Hybrid split.** Scoring is a pure, deterministic function (fully testable,
  reproducible); the SDK call only generates narrative prose. The decision is
  never made by the LLM.
- **Scoring + persistence live in `packages/db`**, alongside the existing
  `templates.ts` and catalog data-access — reuses the M2/M3 data-access layers
  with no second access path.
- **The narrative call uses the `llm-foundation` client**, invoked server-side
  in `apps/web`; tested with mocked SDK responses.
- **UI via Claude Design (ADR 0007)** — page spec → `ui-prompts/` prompt →
  Claude Design → integration.

## Technical Approach

### Frontend Components

- **Recommendation Intake page** — collects the nine intake fields.
- **Recommendation Result page** — shows the recommended path/templates, rejected
  alternatives, the trade-off explanation, and learning checkpoints.

Both follow the Claude Design round-trip: Page Spec under `docs/design/` → prompt
under `docs/design/ui-prompts/` → Claude Design draft → Claude Code integration.

### Backend Services

- `recommendations` schema + Drizzle migration; typed intake model.
- Deterministic scoring module — pure function over `golden_paths` + `templates`
  fit-data producing a ranked recommendation and rejected alternatives.
- Recommendation narrative — a bounded Anthropic SDK call on the `llm-foundation`
  client (why each choice fits, complexity risks, learning checkpoints,
  portfolio value).
- Recommendations data-access layer — create/read/update, supporting human edit,
  with a referential-integrity test that every cited slug resolves.

### Infrastructure

- One Drizzle migration on the existing SQLite database. No new infrastructure.

## Implementation Strategy

Schema and intake model land first. Scoring, the narrative call, and the
data-access layer then proceed in parallel (the narrative task also depends on
the `llm-foundation` epic). The two page specs can be written from the start. UI
integration is last, wiring the pages to the scoring + narrative + data-access
layers.

## Task Breakdown Preview

1. **`recommendations` schema + migration + intake type model.** No in-epic
   dependencies.
2. **Deterministic scoring module + tests.** Depends on 1.
3. **Recommendation narrative via Anthropic SDK + mocked tests.** Depends on 1;
   also depends on the `llm-foundation` epic. Parallel with 2 and 4.
4. **Recommendations data-access layer + referential-integrity test.** Depends
   on 1. Parallel with 2 and 3.
5. **Intake + Result page specs + Claude Design prompts** (UI hand-off gate). No
   dependencies; parallel from the start.
6. **Integrate the Recommendation Intake + Result UI.** Depends on 2, 3, 4, 5.

Parallelization: task 5 runs immediately; tasks 2, 3, 4 run in parallel after
task 1; task 6 is last.

## Dependencies

- **`llm-foundation`** epic — hard dependency for task 3 (the narrative call).
- **M2 `golden-path-catalog`** — `golden_paths` table + data-access (shipped).
- **M3 `template-registry`** — `templates` table, data-access, fit-data
  (shipped).
- Governed by **ADR 0005** (LLM mechanism) and **ADR 0007** (UI tool).
- **Cross-epic coordination:** shares `packages/db/src/schema.ts` and the
  migrations sequence with the parallel `stack-explainer` epic — each adds a
  distinct table; migration numbers are resolved at merge time.

## Success Criteria (Technical)

- Given a sample intake, the engine returns a ranked Golden Path + templates
  citing real slugs, plus at least one rejected alternative with a reason.
- The narrative covers fit, complexity risks, learning checkpoints, and
  portfolio value, and references the intake.
- `recommendations` table, migration, and data-access layer land with tests; the
  referential-integrity test passes.
- Intake and Result pages integrated into `apps/web` and wired to the engine.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` pass with no API key.

## Estimated Effort

Medium — 6 tasks. Critical path: task 1 → task 3 (narrative) → task 6
(integration). Runs as a parallel worktree epic alongside `stack-explainer` once
`llm-foundation` lands.

## Tasks Created
- [ ] #77 - recommendations schema + migration + intake type model (parallel: false)
- [ ] #78 - Deterministic scoring module + tests (parallel: true)
- [ ] #79 - Recommendation narrative via Anthropic SDK + mocked tests (parallel: true)
- [ ] #80 - Recommendations data-access layer + referential-integrity test (parallel: true)
- [ ] #81 - Intake + Result page specs + Claude Design prompts (parallel: true)
- [ ] #82 - Integrate the Recommendation Intake + Result UI (parallel: false)

Total tasks: 6
Parallel tasks: 4 (002, 003, 004 — after 001; 005 — from start)
Sequential tasks: 2 (001 first; 006 last)
Estimated total effort: 44 hours
