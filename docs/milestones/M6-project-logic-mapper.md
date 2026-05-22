# M6 — Project Logic Mapper

**State:** ✅ Complete — epic #100 done & archived; all tasks #101–#108 merged to
`main` via PR #117 · **Date:** 2026-05-22

Goal: take a GitHub repository snapshot imported by M11 and generate an
understandable map of an AI-generated project, so a job-seeking junior dev can
explain how their AI-assisted project works as a system — and knows where to
start debugging it. Seven outputs tied to the real repo: an architecture
overview, a key-file map, a request/data flow, a state flow, an AI-call flow,
Mermaid diagram source for the flows, and a debug path — never generic
architecture boilerplate.

## Scope decisions

- **LLM mechanism (ADR 0005):** M6 is the project's one deliberate
  **LangChain.js + LangGraph** showcase — a genuine multi-step *agentic +
  retrieval* task, not a bounded prompt→output call like M4/M5/M8.
- **Pipeline shape:** deterministic ingestion extracts the file tree and file
  set; LangChain RAG loaders/splitters/an in-memory keyword retriever index the
  snapshot so agentic nodes retrieve relevant code on demand; a LangGraph
  `StateGraph` orchestrates the eight-node workflow (ingestion → architecture →
  key-file map → request/data flow → state flow → AI-call flow → debug path →
  Mermaid assembly). Token use stays bounded via retrieval.
- **Storage (ADR 0006):** one new `project_maps` table joins the existing SQLite
  store — keyed per snapshot, structured/list-valued fields as JSON columns.
- **Package layout (ADR 0005):** the LangChain/LangGraph pipeline is confined to
  `packages/ai/src/mapper/`; the ingestion + data-access layer live in
  `packages/db/src/mapper/`.
- **UI via Claude Design (ADR 0007):** four page specs + prompts written before
  any generation — Project Map page, Architecture Flow Viewer, File Map
  Explorer, Debug Path UI.

## Execution backlog

| Issue | Task | Status |
|---|---|---|
| #101 | Install LangChain.js + LangGraph; setup note + tool-radar entry | ✅ Done |
| #102 | `project_maps` schema + Drizzle migration | ✅ Done — `845ae60` |
| #103 | Deterministic ingestion module + tests | ✅ Done — `8230f89` |
| #104 | LangChain RAG layer | ✅ Done — `ec441f8` |
| #105 | LangGraph mapping pipeline + mocked tests | ✅ Done — `2ead337` |
| #106 | project-maps data-access layer + integrity check | ✅ Done — `e193ec2` |
| #107 | Project Logic Mapper page specs + Claude Design prompts | ✅ Done |
| #108 | Integrate the Project Logic Mapper UI + Mermaid rendering | ✅ Done — `68fd2da` |

All eight tasks were executed in parallel waves in the `epic/project-logic-mapper`
worktree and landed via **PR #117** for human review + CI.

## Delivered

- `packages/db` — `project_maps` table + migration `0005_vengeful_beast`; the
  `src/mapper/` backend: deterministic ingestion (`ingest.ts`, `imports.ts`) and
  the typed data-access layer + file-reference integrity check
  (`project-maps.ts`).
- `packages/ai/src/mapper/` — the LangChain/LangGraph pipeline:
  - **`loader.ts`** / **`retriever.ts`** / **`rag.ts`** — RAG layer: loads and
    splits snapshot files into chunks, indexes them in an in-memory keyword
    retriever (deterministic, offline), with token-bound estimation helpers.
  - **`pipeline.ts`** — the LangGraph `StateGraph`: deterministic ingestion and
    Mermaid-assembly nodes, six agentic RAG-grounded section nodes; output is a
    single typed `ProjectMapContent` with all seven outputs.
  - **`model.ts`** — the `MapperModel` chat-model seam, real impl backed by
    LangChain's `ChatAnthropic`, built lazily so import needs no API key.
- `apps/web` — routes `/map` and `/map/[owner]/[repo]`; the four UI pieces plus
  a client-side Mermaid renderer (`mermaid@^11.15.0`). The pipeline runs only
  server-side via a Server Action; the page never touches the model.

## Acceptance Criteria (milestone plan)

- [x] A LangGraph workflow produces all seven outputs in one typed structure.
- [x] Claude is reached via LangChain's Anthropic integration.
- [x] The pipeline consumes deterministic ingestion and retrieves code through
      the RAG layer; token use stays bounded for large repos.
- [x] Every file/module reference resolves to a real snapshot path; a non-AI
      project yields an explicit "not applicable" AI-call flow.
- [x] The four UIs are integrated into `apps/web` and routed; Mermaid renders
      client-side; verified green (lint/typecheck/build/test) with no API key.

## Retrospective

**What went well**

- The agentic/deterministic split is visible in the graph: ingestion and Mermaid
  assembly are pure functions, the six section nodes are RAG-grounded model
  calls. Retrieval keeps token use bounded — a test proves a 500-file repo still
  caps retrieval at `k × chunkSize`.
- Graceful degradation was designed in, not bolted on: a non-AI project yields
  an explicit "not applicable" AI-call flow, and malformed model output still
  completes the run with a valid structure.
- Running the four Wave-2/3 tasks as parallel background agents in one epic
  worktree (per ADR 0008) held up — independent file scopes, sequential commits,
  no collisions within the epic.

**What to watch — lessons**

- **Cross-epic migration collision — again.** M6 and M8 ran in parallel
  worktrees and both added a Drizzle `0005` migration; M8 (second to merge)
  regenerated its migration as `0006` via `drizzle-kit generate`. This is the
  exact M3/M11 and M4/M5 lesson, recurred a third time — it is a *known tax*.
  Parallel epics that both add a `packages/db` migration should serialize the
  migration-adding task or budget for the regenerate-on-merge.
- **LLM-call mechanism diverged from M5/M8.** #105's agentic nodes use a
  plain-text JSON-output model seam rather than the tool-use round-trip the
  M5/M8 bounded calls use — a deliberate choice for a smaller, deterministic CI
  mock, and legitimate for LangChain's per-node single-reply pattern. Still, it
  is a second answer to "how does an LLM node return structured output." Worth
  an ADR 0005 note so the divergence is recorded, not rediscovered.
- **`ProjectMapContent` is matched structurally, not imported.** The pipeline
  output (`packages/ai`) and the persistence shape (`packages/db`) agree by
  structural typing to avoid a dependency cycle (`packages/db` already depends
  on `packages/ai`). There is no compile-time link — the two shapes can drift
  silently. A shared types package would close this.

**Follow-ups**

- File references in the Project Map UI render as monospace text, not links —
  no in-app file viewer route yet (same gap M5 documented).
- App-wide nav remains per-feature `chrome.tsx` files; the `/map` link was added
  to this feature's nav only. The unifying nav pass is still unscoped.
- M8 (Diff Review) shipped in parallel; M7 remains next per the milestone plan.
