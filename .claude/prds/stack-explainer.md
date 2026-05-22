---
name: stack-explainer
description: M5 — a bounded Anthropic SDK call explains why an imported repo uses its tech stack (decision map, per-tool purpose, alternatives, job relevance, debug entry points); explanations persist to SQLite.
status: backlog
created: 2026-05-22T00:20:11Z
---

# PRD: stack-explainer

## Executive Summary

Milestone 5. The Stack Decision Explainer takes a GitHub repository snapshot
imported by M11 and helps a job-seeking junior dev understand *why* their
AI-assisted or vibe-coded project uses the technology stack it does. It produces
a stack decision map, a plain-language purpose for each major tool, alternatives
with trade-offs, job-market relevance, key files to inspect, and debugging entry
points — all tied to the actual project, never generic tutorial text.

Per ADR 0005, it is a **bounded Anthropic SDK call** — prompt → structured
output, with tool use for reading specific snapshot files so the explanation
cites real code. It is not an autonomous agent (agentic work is M6). It builds
on the `llm-foundation` shared client. Explanations persist to the existing
SQLite database so they are revisitable. The Stack Explanation page, Stack
Decision Map, and Alternatives Comparison UIs are produced through the Claude
Design round-trip (ADR 0007).

## Problem Statement

M11 lets a user import an AI-assisted repo into a local snapshot, but a snapshot
is only data. The junior dev who built that project with heavy AI assistance
still cannot explain why it uses Next.js, why Drizzle instead of Prisma, what
each tool actually does in the project, or where to start debugging — so they
cannot defend those choices in an interview.

Generic tutorial content does not solve this: the explanation has to reference
the user's actual files and dependencies. That requires reading the snapshot and
reasoning over it. Per ADR 0005, M5 is a bounded prompt → structured-output
call on the Anthropic SDK — with tool use to read specific snapshot files —
grounded in the real project rather than reciting documentation.

## User Stories

- **As a junior dev**, I select an imported repo and get a stack decision map
  showing each major tool and why it is there.
  *Acceptance:* the map covers the stack detected from the snapshot's package
  and config files; each major tool is named.

- **As a junior dev**, for each major tool I can explain its purpose in plain
  language.
  *Acceptance:* each per-tool explanation references the project's actual usage
  or files.

- **As a junior dev**, I can see alternatives to each tool and what would change
  if one were used instead.
  *Acceptance:* each major tool has at least one alternative with a concrete
  trade-off.

- **As a junior dev preparing for interviews**, I see each tool's job-market
  relevance.
  *Acceptance:* a relevance note is present for each major tool.

- **As a junior dev**, I get key files to inspect and debugging entry points for
  the project.
  *Acceptance:* every file reference resolves to a real path in the snapshot.

- **As a developer**, explanations are saved and retrievable.
  *Acceptance:* a `stack_explanations` table stores the explanation keyed by
  snapshot; a data-access layer and tests cover it.

## Functional Requirements

- **FR-1 — Snapshot input.** The explainer consumes an imported-repo snapshot
  through the M11 data-access layer — file tree, key files, package/config
  files, and metadata.
- **FR-2 — Stack detection.** A deterministic module identifies the major tools
  and frameworks from the snapshot's package and configuration files.
- **FR-3 — Explanation call.** A bounded Anthropic SDK call, built on the
  `llm-foundation` client, produces a typed, structured explanation: stack
  decision map, per-tool purpose, alternatives and trade-offs, job-market
  relevance, key files to inspect, and debugging entry points. It uses tool use
  to read specific snapshot files and structured outputs; it is a bounded call,
  not an autonomous agent.
- **FR-4 — Project-tied output.** Every explanation references actual snapshot
  files or dependencies — no generic tutorial text. File references resolve to
  real snapshot paths.
- **FR-5 — Tool-fact grounding.** Where a detected tool also appears in the M3
  template registry, the call may draw on the registry's authored alternatives
  and fit-data to ground its explanation.
- **FR-6 — Persistence.** A `stack_explanations` table, added via a Drizzle
  migration to the existing SQLite database (ADR 0006), stores the explanation
  keyed by snapshot (`owner/repo` + ref) — list-valued fields as JSON columns.
  No new database.
- **FR-7 — Data-access layer.** A typed module to create, read, and update
  stack explanations server-side from the Next.js app.
- **FR-8 — UI via Claude Design.** A Stack Explanation page, a Stack Decision
  Map UI, and an Alternatives Comparison UI — each preceded by a Page Spec under
  `docs/design/` and a prompt under `docs/design/ui-prompts/` before any Claude
  Design generation (ADR 0007).

## Non-Functional Requirements

- **Reproducible:** the explanation call is tested with mocked/recorded SDK
  responses per the `llm-foundation` test strategy; CI makes no live API calls.
- **Project-grounded:** explanation file references are validated against the
  snapshot by an integrity check.
- **Non-duplicative:** reuses the M11 snapshot data-access layer and the
  `llm-foundation` client; no second snapshot-access or SDK path.
- **Resilient:** a snapshot whose stack is only partially recognized degrades
  gracefully rather than failing.

## Success Criteria

- Given a sample imported snapshot, the explainer produces a stack decision map
  covering the detected major tools, each with a purpose, at least one
  alternative with a trade-off, and a job-market relevance note.
- The output includes key files to inspect and debugging entry points, all
  resolving to real snapshot paths.
- The `stack_explanations` table, its migration, the data-access layer, and
  tests land.
- The three UI pieces are integrated into `apps/web` and wired to the explainer.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` all pass — with no
  API key set.

## Constraints & Assumptions

- The LLM mechanism is fixed by **ADR 0005**: a bounded Anthropic SDK call, not
  an autonomous agent, not LangChain.
- Depends on the `llm-foundation` epic; LLM work cannot begin until it lands.
- Reuses the existing SQLite database (ADR 0006) — one new table, no new
  database.
- UI uses Claude Design (ADR 0007), only after page specs exist.
- Assumes at least one repository can be imported via M11 to explain over.

## Out of Scope

- The `llm-foundation` shared client (separate, prerequisite epic).
- M4 recommendation.
- Any agent framework or LangChain — ADR 0005 reserves agentic work for M6
  (Project Logic Mapper).
- M6 Project Logic Mapper — architecture flow, request/data flow, and Mermaid
  diagrams are a separate, later milestone; M5 explains the *stack*, not the
  code logic.
- Importing repositories (owned by M11).
- Deep static analysis or AST parsing of source code.

## Dependencies

- **`llm-foundation`** epic — hard dependency for the explanation call.
- **M11 `github-integration`** — snapshot schema, import module, key-file
  selection, and data-access layer (shipped).
- **M3 `template-registry`** — authored tool fit-data for optional grounding
  (shipped).
- Governed by **ADR 0005** (LLM mechanism) and **ADR 0007** (UI tool).
- The existing `apps/web` Next.js app.
