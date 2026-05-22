---
name: stack-explainer
status: completed
created: 2026-05-22T00:20:11Z
updated: 2026-05-22T03:05:33Z
progress: 100%
prd: .claude/prds/stack-explainer.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/83
---

# Epic: stack-explainer

## Overview

Milestone 5. Build the Stack Decision Explainer: given an imported GitHub repo
snapshot (M11), a deterministic detection step identifies the major tools, and a
bounded Anthropic SDK call (per ADR 0005), built on the `llm-foundation` client,
produces a stack decision map, per-tool purpose, alternatives with trade-offs,
job-market relevance, key files to inspect, and debugging entry points — all
tied to the actual project. Explanations persist to the existing SQLite
database, and three UIs are produced through the Claude Design round-trip.

## Architecture Decisions

- **LLM mechanism fixed by ADR 0005** — a bounded Anthropic SDK call (prompt →
  structured output, with tool use to read snapshot files). Not an autonomous
  agent, not LangChain. No new ADR.
- **Reuse the SQLite database (ADR 0006)** — add one `stack_explanations` table
  via a Drizzle migration, keyed by snapshot (`owner/repo` + ref). No new
  database.
- **Detection is deterministic.** Parsing package/config files to identify major
  tools is a pure, tested module — separate from the SDK call, so detection is
  reproducible and the call reasons over a known tool set.
- **The call reads the snapshot via tool use.** The Anthropic SDK call, on the
  `llm-foundation` client, uses tool use to read specific snapshot files, so
  every explanation cites real code rather than generic documentation.
- **Reuse the M11 snapshot data-access layer** — no second snapshot-access path.
- **Optional grounding from M3.** Where a detected tool also appears in the
  template registry, the call may draw on its authored alternatives/fit-data.
- **UI via Claude Design (ADR 0007)** — page spec → `ui-prompts/` prompt →
  Claude Design → integration.

## Technical Approach

### Frontend Components

- **Stack Explanation page** — the full per-project explanation.
- **Stack Decision Map UI** — the tool-by-tool decision map.
- **Alternatives Comparison UI** — alternatives and trade-offs per tool.

All follow the Claude Design round-trip: Page Spec under `docs/design/` → prompt
under `docs/design/ui-prompts/` → Claude Design draft → Claude Code integration.

### Backend Services

- `stack_explanations` schema + Drizzle migration.
- Stack detection module — parses snapshot package/config files into a set of
  major tools, with tests.
- Explanation call — a bounded Anthropic SDK call on the `llm-foundation`
  client, with tool use to read snapshot files, producing the structured
  explanation; tested with mocked SDK responses.
- Stack-explanations data-access layer — create/read/update, plus a
  file-reference integrity check that every cited path exists in the snapshot.

### Infrastructure

- One Drizzle migration on the existing SQLite database. No new infrastructure.

## Implementation Strategy

The schema, the detection module, and the page specs can all start immediately
and independently. The explanation call follows detection (and depends on the
`llm-foundation` epic). The data-access layer follows the schema. UI integration
is last, wiring the three pages to the explanation call and data-access layers.

## Task Breakdown Preview

1. **`stack_explanations` schema + Drizzle migration.** No in-epic dependencies.
2. **Stack detection module + tests** — package/config files → major tools. No
   dependencies; parallel from the start.
3. **Stack explanation via Anthropic SDK + mocked tests** — structured
   explanation on the `llm-foundation` client with tool use for snapshot files.
   Depends on 2; also depends on the `llm-foundation` epic.
4. **Stack-explanations data-access layer + file-reference integrity check.**
   Depends on 1.
5. **Stack Explainer page specs + Claude Design prompts** (UI hand-off gate). No
   dependencies; parallel from the start.
6. **Integrate the Stack Explainer UI** (three pieces). Depends on 3, 4, 5.

Parallelization: tasks 1, 2, and 5 all start immediately; task 3 follows task 2;
task 4 follows task 1; task 6 is last.

## Dependencies

- **`llm-foundation`** epic — hard dependency for task 3 (the explanation call).
- **M11 `github-integration`** — snapshot schema, import module, key-file
  selection, data-access layer (shipped).
- **M3 `template-registry`** — authored tool fit-data for optional grounding
  (shipped).
- Governed by **ADR 0005** (LLM mechanism) and **ADR 0007** (UI tool).
- **Cross-epic coordination:** shares `packages/db/src/schema.ts` and the
  migrations sequence with the parallel `recommendation-engine` epic — each adds
  a distinct table; migration numbers are resolved at merge time.

## Success Criteria (Technical)

- Given a sample imported snapshot, the explainer produces a stack decision map
  covering the detected major tools, each with a purpose, at least one
  alternative + trade-off, and a job-market relevance note.
- Output includes key files to inspect and debugging entry points, all resolving
  to real snapshot paths.
- `stack_explanations` table, migration, data-access layer, and integrity check
  land with tests.
- The three UI pieces integrated into `apps/web` and wired to the explainer.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` pass with no API key.

## Estimated Effort

Medium — 6 tasks. Critical path: task 2 → task 3 (explanation call) → task 6
(integration). Runs as a parallel worktree epic alongside `recommendation-engine`
once `llm-foundation` lands.

## Tasks Created
- [x] #84 - stack_explanations schema + migration (parallel: true)
- [x] #85 - Stack detection module + tests (parallel: true)
- [x] #86 - Stack explanation via Anthropic SDK + mocked tests (parallel: true)
- [x] #87 - Stack-explanations data-access layer + file-reference integrity check (parallel: true)
- [x] #88 - Stack Explainer page specs + Claude Design prompts (parallel: true)
- [x] #89 - Integrate the Stack Explainer UI (parallel: false)

Total tasks: 6
Parallel tasks: 5 (001, 002, 005 — from start; 003 — after 002; 004 — after 001)
Sequential tasks: 1 (006 last)
Estimated total effort: 45 hours
