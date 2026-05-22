---
name: project-logic-mapper
status: completed
created: 2026-05-22T14:03:40Z
updated: 2026-05-22T19:37:21Z
progress: 100%
prd: .claude/prds/project-logic-mapper.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/100
---

# Epic: project-logic-mapper

## Overview

Milestone 6. Build the Project Logic Mapper: given an imported GitHub repo
snapshot (M11), a deterministic ingestion step extracts the file tree, module
graph, and import relationships; a LangChain RAG layer indexes the snapshot;
and a LangGraph workflow orchestrates a multi-step agentic + retrieval pipeline
that produces seven project-tied outputs — architecture overview, key-file map,
request/data flow, state flow, AI-call flow, Mermaid diagrams, and a debug
path. Maps persist to the existing SQLite database, and four UIs are produced
through the Claude Design round-trip.

Per ADR 0005, M6 is the project's one deliberate LangChain.js + LangGraph
showcase — confined to this pipeline.

## Architecture Decisions

- **LLM mechanism fixed by ADR 0005** — M6 is the LangChain.js + LangGraph
  showcase: a multi-step agentic + retrieval pipeline, not a bounded Anthropic
  SDK call like M4/M5/M8. LangChain stays confined to the M6 pipeline package.
  No new ADR; M6 carries its own official-docs install check per ADR 0005's
  consequences and the official-installation rule.
- **Ingestion is deterministic.** Extracting the file tree, module/dependency
  graph, and import relationships is a pure, tested module — separate from the
  pipeline, so the structural base is reproducible and the LLM nodes reason
  over a known graph.
- **RAG over whole-context stuffing.** LangChain document loaders, splitters,
  and retrievers index the snapshot so pipeline steps retrieve relevant code on
  demand — token use stays bounded regardless of repo size.
- **LangGraph orchestration.** A LangGraph workflow sequences the seven outputs,
  with deterministic nodes where a step is mechanical and agentic LLM+retrieval
  nodes where reasoning over code is needed. Claude is reached via LangChain's
  Anthropic integration.
- **Reuse M5 stack-detection** — frameworks and entry points come from the
  shipped `packages/db/src/stack` detection output; no re-detection.
- **Reuse the SQLite database (ADR 0006)** — add one `project_maps` table via a
  Drizzle migration, keyed by snapshot (`owner/repo` + ref). No new database.
- **Reuse the M11 snapshot data-access layer** — no second snapshot-access path.
- **UI via Claude Design (ADR 0007)** — page spec → `ui-prompts/` prompt →
  Claude Design → integration. Mermaid diagrams render client-side.

## Technical Approach

### Frontend Components

- **Project Map page** — the full per-project logic map.
- **Architecture Flow Viewer** — request/data, state, and AI-call flows.
- **File Map Explorer** — the key-file map.
- **Debug Path UI** — the debug entry points and walkthrough.

All follow the Claude Design round-trip: Page Spec under `docs/design/` → prompt
under `docs/design/ui-prompts/` → Claude Design draft → Claude Code integration.
Mermaid diagram source from the pipeline is rendered client-side.

### Backend Services

- LangChain.js + LangGraph installed per official docs; setup note + tool-radar
  entry.
- `project_maps` schema + Drizzle migration.
- Deterministic ingestion module — snapshot → file tree, module/dependency
  graph, import relationships; reuses M5 stack-detection; with tests.
- LangChain RAG layer — loaders/splitters/retrievers indexing the snapshot.
- LangGraph mapping pipeline — the workflow producing the seven structured
  outputs incl. Mermaid source; tested with mocked model responses.
- project-maps data-access layer — create/read/update, plus a file-reference
  integrity check that every cited path exists in the snapshot.

### Infrastructure

- One Drizzle migration on the existing SQLite database. New `@langchain/*` and
  `@langchain/langgraph` dependencies, scoped to the M6 pipeline package. No
  other new infrastructure.

## Implementation Strategy

The LangChain/LangGraph install, the schema, the deterministic ingestion
module, and the page specs can all start immediately and independently. The RAG
layer follows the install. The LangGraph pipeline — the critical path — follows
the install, ingestion, and RAG layer. The data-access layer follows the
schema. UI integration is last, wiring the four pages to the pipeline and the
data-access layer.

## Task Breakdown Preview

1. **Install LangChain.js + LangGraph; setup note + tool-radar entry.** Per
   official docs (ADR 0005). No in-epic dependencies; parallel from the start.
2. **`project_maps` schema + Drizzle migration.** No dependencies; parallel.
3. **Deterministic ingestion module + tests** — file tree, module/dependency
   graph, import relationships; reuses M5 stack-detection. No dependencies;
   parallel.
4. **LangChain RAG layer** — loaders/splitters/retrievers indexing the snapshot.
   Depends on 1.
5. **LangGraph mapping pipeline + mocked tests** — the workflow producing all
   seven structured outputs incl. Mermaid source. Depends on 1, 3, 4. Critical
   path.
6. **project-maps data-access layer + file-reference integrity check.** Depends
   on 2.
7. **Project Logic Mapper page specs + Claude Design prompts** (UI hand-off
   gate) — four pieces. No dependencies; parallel from the start.
8. **Integrate the Project Logic Mapper UI** (four pieces) + client-side Mermaid
   rendering. Depends on 5, 6, 7.

Parallelization: tasks 1, 2, 3, and 7 start immediately; task 4 follows task 1;
task 5 follows tasks 1, 3, 4; task 6 follows task 2; task 8 is last.

## Dependencies

- **M11 `github-integration`** — snapshot schema, import module, key-file
  selection, data-access layer (shipped).
- **M5 `stack-explainer`** — stack-detection output reused as pipeline context
  (shipped).
- **`llm-foundation`** — API-key configuration convention (shipped); M6 reaches
  Claude via LangChain's Anthropic integration, not the `packages/ai` client.
- **LangChain.js + LangGraph** — new tool dependencies, installed per official
  docs (ADR 0005, official-installation rule).
- Governed by **ADR 0005** (LLM mechanism), **ADR 0006** (storage), **ADR 0007**
  (UI tool), **ADR 0001** (tool adoption).
- **Cross-epic coordination:** shares `packages/db/src/schema.ts` and the
  migrations sequence with the parallel `diff-review` epic — each adds distinct
  tables; migration numbers resolved at merge time. Both touch `apps/web`
  routing additively.

## Success Criteria (Technical)

- Given a sample imported snapshot, the mapper produces all seven outputs, each
  grounded in real snapshot paths.
- Mermaid diagrams render in the UI with nodes mapping to real files/modules.
- `project_maps` table, migration, data-access layer, and integrity check land
  with tests.
- LangChain.js + LangGraph installed per official docs and recorded in a setup
  note and the tool radar.
- The four UI pieces integrated into `apps/web` and wired to the mapper.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` pass with no API key.

## Estimated Effort

Large — 8 tasks. Critical path: task 1 (install) → task 4 (RAG) → task 5
(LangGraph pipeline) → task 8 (integration). Runs as a parallel worktree epic
alongside `diff-review`.

## Tasks Created
- [ ] #101 - Install LangChain.js + LangGraph; setup note + tool-radar entry (parallel: true)
- [ ] #102 - project_maps schema + Drizzle migration (parallel: true)
- [ ] #103 - Deterministic ingestion module + tests (parallel: true)
- [ ] #104 - LangChain RAG layer (parallel: true)
- [ ] #105 - LangGraph mapping pipeline + mocked tests (parallel: true)
- [ ] #106 - project-maps data-access layer + file-reference integrity check (parallel: true)
- [ ] #107 - Project Logic Mapper page specs + Claude Design prompts (parallel: true)
- [ ] #108 - Integrate the Project Logic Mapper UI + Mermaid rendering (parallel: false)

Total tasks: 8
Parallel tasks: 7 (deps gate start order: 004 after 001; 005 after 001/003/004; 006 after 002)
Sequential tasks: 1 (008 last)
Estimated total effort: 90 hours
