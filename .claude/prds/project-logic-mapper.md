---
name: project-logic-mapper
description: M6 — a LangChain.js + LangGraph agentic + RAG pipeline that maps an imported repo's logic (architecture overview, key-file map, request/data flow, state flow, AI-call flow, Mermaid diagrams, debug path); maps persist to SQLite.
status: backlog
created: 2026-05-22T13:47:16Z
---

# PRD: project-logic-mapper

## Executive Summary

Milestone 6. The Project Logic Mapper takes a GitHub repository snapshot
imported by M11 and generates an understandable map of an AI-generated project,
so a job-seeking junior dev can explain how their AI-assisted or vibe-coded
project actually works as a system — and knows where to start debugging it.

It produces seven outputs tied to the real repo: an architecture overview, a
key-file map, a request/data flow, a state flow, an AI-call flow, Mermaid
diagrams for those flows, and a debug path — never generic architecture
boilerplate.

Per **ADR 0005**, M6 is the project's one deliberate **LangChain.js +
LangGraph** showcase: a genuine multi-step *agentic + retrieval* task, not a
bounded prompt→output call like M4/M5/M8. Deterministic extraction of the file
tree, module graph, and import relationships is the ingestion step; LangChain
RAG loaders/splitters/retrievers index the snapshot so the pipeline retrieves
relevant code on demand; a LangGraph workflow orchestrates the multi-step
analysis. M6 reuses M5's stack-detection output as context. Generated maps
persist to the existing SQLite database so they are revisitable. The Project Map
page, Architecture Flow Viewer, File Map Explorer, and Debug Path UI are produced
through the Claude Design round-trip (ADR 0007).

## Problem Statement

M11 lets a user import an AI-assisted repo into a local snapshot, and M5
explains *why* the project uses its tech stack. Neither explains the project's
**code logic** — how the pieces fit together as a running system. The junior
dev who built the project with heavy AI assistance has a working repo but
cannot trace a request from the entry point to the core output, cannot say
where state lives, where AI calls happen, or where to start when something
breaks. They cannot defend the project's design in an interview, and they
cannot safely modify it.

Generic architecture diagrams do not solve this — the map has to be derived
from the user's actual files and import graph. Producing it is a multi-step
problem: ingest the repo, retrieve the files relevant to each flow, reason over
them, and emit diagrams and a debug path. Per ADR 0005 this is exactly the
agentic + retrieval workload reserved for the LangChain.js + LangGraph pipeline.

## User Stories

- **As a junior dev**, I select an imported repo and get a plain-language
  architecture overview.
  *Acceptance:* the overview names the major layers/modules detected from the
  snapshot's file tree and stack data.

- **As a junior dev**, I get a key-file map showing what each important file
  does.
  *Acceptance:* every file in the map resolves to a real path in the snapshot.

- **As a junior dev**, I can trace how a request or data flows from the entry
  point to the core output.
  *Acceptance:* the flow is a named, ordered path of real files/modules.

- **As a junior dev**, I can see where and how the project manages state.
  *Acceptance:* state sources/stores are identified with file references, or
  explicitly reported as none found.

- **As a junior dev**, I can see where the project calls AI/LLM services.
  *Acceptance:* AI-call sites are identified with file references, or explicitly
  reported as not applicable for a non-AI project.

- **As a junior dev**, I get Mermaid diagrams of the flows.
  *Acceptance:* diagrams render in the UI and their nodes correspond to real
  files/modules.

- **As a junior dev**, I get a debug path telling me where to start for common
  failures.
  *Acceptance:* each debug entry point references a real file in the snapshot.

- **As a developer**, generated maps are saved and retrievable.
  *Acceptance:* a `project_maps` table stores the map keyed by snapshot; a
  data-access layer and tests cover it.

- **As a job-seeking junior dev**, the map lets me explain the project end to
  end.
  *Acceptance:* from the map a user can explain the flow from entry point to
  core output and name where to start debugging — the M6 milestone acceptance.

## Functional Requirements

- **FR-1 — Snapshot input.** The mapper consumes an imported-repo snapshot
  through the M11 data-access layer — file tree, key files, package/config
  files, and metadata. It does not import repositories.
- **FR-2 — Deterministic ingestion.** A tested module extracts the file tree,
  module/dependency graph, and import relationships from the snapshot. This
  structured extraction is the ingestion step feeding the pipeline, and reuses
  M5's stack-detection output (frameworks, entry points) as context rather than
  re-detecting.
- **FR-3 — LangChain RAG layer.** Snapshot files are loaded, split, and indexed
  with LangChain document loaders, splitters, and retrievers so the pipeline
  retrieves the code relevant to each step on demand, instead of stuffing the
  whole repository into the model context.
- **FR-4 — LangGraph pipeline.** A LangGraph workflow orchestrates the
  multi-step mapping — architecture overview, key-file map, request/data flow,
  state flow, AI-call flow, and debug path — with deterministic nodes where a
  step is mechanical and agentic LLM+retrieval nodes where reasoning over code
  is needed. Claude models are accessed via LangChain's Anthropic integration.
- **FR-5 — Seven outputs.** The pipeline produces typed, structured output for
  all seven: architecture overview, key-file map, request/data flow, state
  flow, AI-call flow, Mermaid diagrams, and debug path.
- **FR-6 — Project-tied output.** Every file/module reference resolves to a real
  snapshot path; no generic architecture text. Mermaid diagram nodes correspond
  to real files/modules.
- **FR-7 — Mermaid generation.** Each flow is emitted as Mermaid diagram source
  and rendered client-side in the UI.
- **FR-8 — Persistence.** A `project_maps` table, added via a Drizzle migration
  to the existing SQLite database (ADR 0006), stores the generated map keyed by
  snapshot (`owner/repo` + ref) — structured/list-valued fields as JSON
  columns. No new database.
- **FR-9 — Data-access layer.** A typed module to create, read, and update
  project maps server-side from the Next.js app.
- **FR-10 — UI via Claude Design.** A Project Map page, an Architecture Flow
  Viewer, a File Map Explorer, and a Debug Path UI — each preceded by a Page
  Spec under `docs/design/` and a prompt under `docs/design/ui-prompts/` before
  any Claude Design generation (ADR 0007).
- **FR-11 — Official-docs installation.** LangChain.js and LangGraph are
  installed following their official documentation and recorded in a setup note
  and the tool radar (ADR 0005 consequence and the official-installation rule).

## Non-Functional Requirements

- **Reproducible:** the deterministic ingestion module is fully unit-tested;
  the LangGraph pipeline is tested with mocked/recorded model responses per the
  `llm-foundation` test strategy. CI makes no live API calls.
- **Project-grounded:** all file references are validated against the snapshot
  by an integrity check.
- **Non-duplicative:** reuses the M11 snapshot data-access layer and M5
  stack-detection; no second snapshot-access path and no re-detection of the
  stack.
- **LangChain confined to M6:** per ADR 0005, LangChain.js / LangGraph stay
  inside the M6 pipeline package — not a whole-app abstraction and not used by
  M4/M5/M8.
- **Resilient:** a snapshot with no clear entry point, or a non-AI project,
  degrades gracefully — partial maps with explicit "none found" / "not
  applicable" sections rather than a failure.
- **Bounded token use:** RAG retrieval keeps model token usage bounded
  regardless of repository size.

## Success Criteria

- Given a sample imported snapshot, the mapper produces all seven outputs, each
  grounded in real snapshot paths.
- Mermaid diagrams render in the UI with nodes mapping to real files/modules.
- The `project_maps` table, its migration, the data-access layer, and tests
  land.
- The four UI pieces are integrated into `apps/web` and wired to the mapper.
- LangChain.js and LangGraph are installed per official docs and recorded in a
  setup note and the tool radar.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` all pass — with no
  API key set.
- A user can explain the project flow from entry point to core output and name
  where to start debugging common failures (the M6 milestone acceptance).

## Constraints & Assumptions

- The LLM mechanism is fixed by **ADR 0005**: M6 is the deliberate LangChain.js
  + LangGraph showcase — an agentic + retrieval pipeline, confined to M6, not a
  bounded Anthropic SDK call like M4/M5/M8.
- LangChain.js / LangGraph are installed per official documentation (the
  official-installation rule) and recorded in a setup note and the tool radar.
- Reuses the existing SQLite database (ADR 0006) — one new table, no new
  database.
- UI uses Claude Design (ADR 0007), only after page specs exist.
- Builds on M11 (snapshot) and M5 (stack detection) — both shipped.
- Assumes at least one repository can be imported via M11 to map over.
- Claude models are reached through LangChain's Anthropic integration; the
  `llm-foundation` API-key configuration convention is reused where practical.

## Out of Scope

- Importing repositories (owned by M11).
- Explaining *why* the stack was chosen — that is M5; M6 maps the code logic,
  not the tool decisions.
- M7 Issue-Based Learning Workspace, M8 Diff Review, M9 Debug & Expansion
  Challenges, and M10 Learning Memory & Portfolio Export.
- LangChain as a whole-app abstraction, or its use in M4/M5/M8 — ADR 0005
  confines it to M6.
- LLM observability / tracing — LangSmith / Langfuse are M13.
- Deep semantic AST analysis beyond the file, import, and flow mapping needed
  for the seven outputs.
- Executing or running the analyzed project.
- Multi-provider model swapping.

## Dependencies

- **M11 `github-integration`** — snapshot schema, import module, key-file
  selection, and data-access layer (shipped).
- **M5 `stack-explainer`** — stack-detection output reused as pipeline context
  (shipped).
- **LangChain.js + LangGraph** — new tool dependencies, installed per official
  docs and recorded per ADR 0005 and the official-installation rule.
- **`llm-foundation`** — API-key configuration convention and Anthropic access
  (shipped); M6 reaches Claude via LangChain's Anthropic integration rather than
  the bounded `packages/ai` client directly.
- Governed by **ADR 0005** (LLM mechanism), **ADR 0006** (storage), **ADR 0007**
  (UI tool), and **ADR 0001** (tool adoption).
- The existing `apps/web` Next.js app.
