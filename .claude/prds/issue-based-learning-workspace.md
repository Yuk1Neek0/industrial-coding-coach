---
name: issue-based-learning-workspace
description: M7 — turns each GitHub Issue / CCPM task on the user's imported repo into a learning unit (issue goal, related files, concepts, AI-agent execution notes, review checklist, understanding questions, debug/expand challenge stub) via bounded Anthropic SDK calls; units persist to SQLite.
status: backlog
created: 2026-05-24T17:54:09Z
updated: 2026-05-24T19:06:22Z
---

# PRD: issue-based-learning-workspace

## Executive Summary

Milestone 7. The Issue-Based Learning Workspace turns each GitHub Issue
(or CCPM task) on a job-seeking junior dev's imported repo into a structured
**learning unit**: an issue goal restated in the user's own context, the
related files in the repo, the concepts the user needs to understand to ship
the work, AI-agent execution notes describing how AI assistance would
plausibly approach the task, a review checklist for inspecting AI output, a
set of understanding questions to verify comprehension, and a stub
debug/expand challenge that defers to M9.

This sits between M6 (Project Logic Mapper — complete) and M8 (Diff Review —
complete) in the user journey. M6 has already told the user *how their repo
works as a system*; M8 will later help them *review the AI-generated PR that
closes an issue*. M7 lives in between: it teaches the user **per-task, before
they ship**, so they ship with understanding rather than rubber-stamping
AI-generated diffs. It is the per-issue learning surface the product's "see
how real software is built" pillar (US-3 in `product.md`) requires.

Per **ADR 0005**, M7 is a **bounded Anthropic SDK call** — prompt →
structured output, with tool use to read specific repo files via the M11
data-access layer — not an autonomous agent and not LangChain (LangChain is
confined to M6). It builds on the `llm-foundation` shared client and reuses
M6's project map and M11's GitHub client for issues. Learning units, the
user's answers to understanding questions, and review-checklist completion
state persist to the existing SQLite database (ADR 0006) so a user can
revisit a unit. UI is produced through the Claude Design round-trip
(ADR 0007).

## Problem Statement

A job-seeking junior dev who builds with heavy AI assistance treats GitHub
Issues / CCPM tasks the way they treat any other AI input: paste the title
into Claude, accept the diff, merge. They never internalize what each issue
is *about*, what files it touches, what concepts it exercises, or what the
AI agent will plausibly do to satisfy it. So they ship code they cannot
defend in an interview ("walk me through this PR you opened"), cannot
review meaningfully, and cannot extend without re-prompting the AI.

M6 has given them a project map. M8 will later quiz them on a finished PR.
Neither of those teaches them at the moment the work is being done — the
moment that matters most for understanding. M7 turns the issue itself into
the learning surface, before any code is written, so the user enters the AI
session knowing what they are trying to ship, what files are in play, what
they should verify in the AI's output, and what they should be able to
answer afterwards.

Passively accepting AI-generated PRs is the exact habit this product exists
to break. M7 attacks the habit one issue at a time, at the point where the
habit forms. Per ADR 0005 this is a bounded prompt → structured-output call
on the Anthropic SDK; the agentic codebase-understanding work is M6, not
here.

## User Stories

- **As a junior dev**, I select a GitHub Issue on my imported repo and get
  the issue goal restated in the context of my project.
  *Acceptance:* the restated goal references the imported repo (not generic
  template text) and the issue's title/body; the source issue number is
  shown.

- **As a junior dev**, I see the files in my repo that are likely related
  to closing this issue.
  *Acceptance:* every listed file resolves to a real path in the imported
  snapshot (M11) and, where M6 has mapped the file's role, the role is
  shown.

- **As a junior dev**, I see the concepts I need to understand to close
  this issue.
  *Acceptance:* each concept is named, briefly explained, and tied to either
  a related file in the unit or a node in the M6 project map; concepts are
  not generic CS-101 filler.

- **As a junior dev**, I see AI-agent execution notes describing how an
  AI agent (Claude Code, Cursor, etc.) would plausibly approach this issue.
  *Acceptance:* the notes describe the likely change shape (which files,
  which functions, what the diff probably looks like) grounded in the
  related-files list — not a generic "the agent will write code" sentence.

- **As a junior dev**, I get a review checklist of things to verify when
  the AI's output lands.
  *Acceptance:* every checklist item is concrete and tied to a related file
  or concept (e.g., "verify `apps/web/lib/foo.ts` still exports `bar`"), not
  a generic "code review best practice" list.

- **As a junior dev**, I get understanding questions that prove I grasp
  the issue.
  *Acceptance:* questions reference the actual issue and related files;
  answering and getting graded is supported and feeds the Score / Weak Area
  UI (consistent with the M8 understanding-check pattern).

- **As a junior dev**, I see a debug/expand challenge stub for this issue.
  *Acceptance:* the unit displays a stub describing the challenge concept
  and explicitly defers full implementation to M9 (Debug & Expansion
  Challenges) — it does not silently fake M9 functionality.

- **As a developer**, learning units and the user's answers / checklist
  state persist and are retrievable.
  *Acceptance:* a `learning_units` table stores the unit and a related
  table (or JSON column) stores the user's answers, score, and checklist
  state; a data-access layer and tests cover them.

- **As a job-seeking junior dev**, the workspace lets me review AI work
  instead of passively accepting it.
  *Acceptance:* before merging an AI-generated PR for the issue, a user has
  seen the review checklist and answered the understanding questions for
  that issue — the M7 milestone acceptance ("each issue teaches something
  concrete" / "user can review AI work instead of passively accepting it").

## Functional Requirements

- **FR-1 — Issue input.** M7 fetches a GitHub Issue from the user's
  imported repository — its number, title, body, labels, state, and any
  linked PRs where available. Issue fetching is added to the existing M11
  GitHub client, reusing its authentication and rate-limit handling
  (ADR 0009); no second GitHub access path. CCPM task files
  (`.claude/epics/<epic>/<task>.md`) are accepted as an equivalent local
  input shape where the imported repo carries them. **Both inputs are
  normalized into a single learning-unit input shape**: the unit and its UI
  do not differentiate by source, the source (`github-issue` |
  `ccpm-task`) is metadata only.

- **FR-2 — Learning-unit model.** A typed model of the learning unit:
  issue/task reference, restated goal, related-files list (with M6 role
  annotations where available), concepts, AI-agent execution notes, review
  checklist, understanding questions, and a debug/expand challenge stub.

- **FR-3 — Generation call.** A bounded Anthropic SDK call, built on the
  `llm-foundation` client, produces typed, structured output for all seven
  parts of the unit. It uses tool use to read specific snapshot files via
  the M11 data-access layer and to read M6 project-map entries where they
  exist; it is a bounded call, not an autonomous agent. (Per ADR 0005,
  LangChain is confined to M6.)

- **FR-4 — Project-tied output.** Every related file resolves to a real
  snapshot path; every concept ties to a file or a project-map node; every
  checklist item is concrete to this issue. Generic tutorial filler is a
  failure mode — an integrity check rejects unresolved file references.

- **FR-5 — Understanding check.** The user answers the generated
  understanding questions; a bounded grading call (the same pattern as M8)
  scores the answers and produces a numeric score and a weak-area
  breakdown. Results are stored against the unit.

- **FR-6 — Review-checklist state.** The user can mark review-checklist
  items as done / not done for a given unit; state is persisted and
  retrievable. This is the surface that operationalizes "review AI work
  instead of passively accepting it." **The checklist surfaces progress
  but does not gate access to the understanding-question score** —
  product.md's "comprehension over completion" principle wins over
  checkbox-theater enforcement. The Issue Learning Workspace UI shows
  checklist completion as a progress indicator only.

- **FR-7 — Challenge stub.** The unit displays a stub for the
  debug/expand challenge and explicitly defers full implementation to M9.
  The stub includes the challenge concept (e.g., "add a field", "trace a
  failed call") tied to the issue but does not run, grade, or claim to
  resolve a challenge. **M7 ships only minimal stub fields**
  (`challenge_concept`, `challenge_type`) on the learning unit; M9 will add
  its full challenge schema in its own migration when M9 lands. M7 does
  not pre-allocate M9 fields.

- **FR-8 — Persistence.** A single `learning_units` table, added via
  Drizzle migrations to the existing SQLite database (ADR 0006), keyed by
  repo + issue/task identifier. **User answers, the per-attempt score,
  weak-area breakdown, and checklist state all live as JSON columns on
  `learning_units`** — no companion tables — mirroring `project_maps`
  (M6) and `diff_reviews` (M8). No new database.

- **FR-9 — Data-access layer.** A typed module to create, read, and
  update learning units, the user's answers / scores, and checklist state
  server-side.

- **FR-10 — UI via Claude Design.** An Issue Learning Workspace page, a
  Review Checklist UI, an Understanding Questions UI, and a Challenge Panel
  (showing the stub) — each preceded by a Page Spec under `docs/design/`
  and a prompt under `docs/design/ui-prompts/` before any Claude Design
  generation (ADR 0007). **Every new page in M7 goes through the Claude
  Design round-trip**; v0 is **not** used — per ADR 0007 Claude Design
  replaces v0 across the project.

- **FR-11 — Entry point / IA.** The user reaches a learning unit through
  a **per-repo issue list off the M11 imported-repo page**: imported repo
  → "Issues" tab → issue row → learning-unit page. No global cross-repo
  issues index in M7 (a global index, if ever needed, is a follow-up).
  This page is also produced through the Claude Design round-trip
  (ADR 0007) with a Page Spec in `docs/design/`.

## Non-Functional Requirements

- **Reproducible.** The generation and grading calls are tested with
  mocked/recorded SDK responses per the `llm-foundation` test strategy; the
  GitHub Issue fetch is tested with mocked responses. CI makes no live API
  calls and no live GitHub calls.

- **Project-grounded.** File references are validated against the
  imported snapshot's file set by an integrity check; an unresolved
  reference fails the unit rather than silently rendering a broken link.
  Where M6 project-map data exists, the unit reuses it instead of
  re-deriving it.

- **Non-duplicative.** Reuses the M11 GitHub client (extended with issue
  fetching, mirroring how M8 extended it with PR fetching), the M11
  snapshot data-access layer, the M6 project map, and the `llm-foundation`
  client. No second GitHub path, no second SDK client.

- **Fair grading.** Grading produces a typed, reproducible score and
  weak-area breakdown and is covered by the test strategy. The grading
  prompt and structured-output schema match the M8 understanding-check
  pattern so the two surfaces feel like one product, not two.

- **Resilient.** An issue with no body, an issue that references files
  not in the imported snapshot, or an imported repo with no M6 project map
  yet, all degrade gracefully — the unit is produced with explicit "none
  found" / "project map unavailable" sections rather than a hard failure.

- **Bounded token use.** Tool use reads only the related files needed for
  the unit, not the whole snapshot. The call is bounded per ADR 0005 and
  reuses the M8 cost-shape (single review-style call + single grading
  call).

- **Strictly per-unit scoring.** Scores and weak-area breakdowns live on
  the unit; M7 ships no aggregate "comprehension score for this repo"
  view. M10 owns any cross-unit rollup.

## Success Criteria

- Given a sample GitHub Issue on an imported repo, M7 produces a complete
  learning unit with all seven parts grounded in the real repo.
- For at least one sample issue end-to-end: the user opens the unit, sees
  related files and concepts, marks at least one review-checklist item, and
  answers the understanding questions to receive a score and a weak-area
  breakdown.
- The `learning_units` table (plus any companion tables for answers /
  checklist state), its migration, the data-access layer, and tests land.
- The four UI pieces — Issue Learning Workspace page, Review Checklist UI,
  Understanding Questions UI, Challenge Panel — are integrated into
  `apps/web` and wired to the generator and to persistence.
- The challenge stub is present and clearly defers to M9 (no fake
  implementation).
- Issue fetching is added to the existing M11 GitHub client (one access
  path, ADR 0009), and PR-fetching shipped in M8 is left intact.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` all pass — with
  no API key set and no live GitHub calls.
- The M7 milestone acceptance is met: each issue teaches something
  concrete, and the user can review AI work instead of passively accepting
  it.

## Constraints & Assumptions

- The LLM mechanism is fixed by **ADR 0005**: M7 is a bounded Anthropic
  SDK call — not an autonomous agent, and not LangChain (LangChain is
  confined to M6, which M7 reads from but does not extend).
- GitHub access is governed by **ADR 0009**; M7 reuses the M11 GitHub
  client and extends it with issue fetching, the same way M8 extended it
  with PR fetching. Issue fetching is read-only and uses the existing
  `GITHUB_TOKEN` mechanism.
- Reuses the existing SQLite database (ADR 0006) — new tables, no new
  database.
- UI uses Claude Design (ADR 0007), only after page specs exist. The
  milestone plan's "v0 is required" language for M7 is superseded by
  ADR 0007 across the project.
- Depends on the `llm-foundation` client (shipped), M11
  `github-integration` (shipped), and M6 `project-logic-mapper` (shipped).
- Assumes the user's imported repository has at least one GitHub Issue (or
  CCPM task) to teach.
- The Challenge Panel intentionally ships as a stub; M9 (Debug & Expansion
  Challenges) is the milestone that implements challenges in full.
- Per ADR 0008 and CLAUDE.md, M7 runs in its own
  `epic/issue-based-learning-workspace` worktree off `main`.

## Out of Scope

- Importing repositories (owned by M11).
- Mapping the project's logic / architecture (owned by M6; M7 *reads*
  M6 output but does not re-derive it).
- Reviewing AI-generated pull requests after the fact (owned by M8; M7
  prepares the user *before* the PR exists, M8 quizzes them on the
  finished PR).
- **Full debug & expansion challenges** — running, scoring, or grading
  the challenge is M9. M7 ships only the challenge *stub*.
- Long-term, spaced-repetition learning memory over scores — that is
  closer to M10 Learning Memory & Portfolio Export.
- **Cross-unit score rollup** ("comprehension score for this repo") — owned
  by M10; M7 ships strictly per-unit scoring.
- **Global cross-repo issues index** — M7 surfaces issues only per imported
  repo. A global index is a follow-up if ever needed.
- Writing to GitHub (creating, editing, closing issues / commenting / opening
  PRs) — read-only per ADR 0009.
- Executing or modifying the analyzed project's code.
- Autonomous "agentic" issue resolution — M7 teaches the user, it does
  not solve the issue for them.
- LangChain or any agentic pipeline — ADR 0005 confines those to M6.
- LLM observability / tracing — that is M13.

## Dependencies

- **M11 `github-integration`** — the GitHub client, repo identity, and
  ADR 0009 access path; extended here with **issue fetching** (mirroring
  the M8 PR-fetching extension).
- **M6 `project-logic-mapper`** — project map (key-file map, request/data
  flow, debug path) reused as context for related-files annotations and
  concept grounding; M7 does not re-derive the map.
- **`llm-foundation`** — the shared Anthropic SDK client for the
  generation and grading calls.
- **M8 `diff-review`** — pattern source for the understanding-check
  grading and Score / Weak Area UI; M7 reuses the shape but is its own
  bounded call.
- Governed by **ADR 0005** (LLM mechanism), **ADR 0006** (storage),
  **ADR 0007** (UI tool), **ADR 0008** (parallel execution model), and
  **ADR 0009** (GitHub access).
- The existing `apps/web` Next.js app and the M2 `packages/db` Drizzle
  conventions.
- Human approval of this PRD before the epic is parsed.

## Resolved Decisions (2026-05-24)

The PRD review pass with the human reviewer resolved every previously open
question. Decisions are normative; the FR / NFR / Constraints sections above
have been updated to reflect them.

- **R1 — Input shape (was Q1).** GitHub Issues and CCPM tasks are
  normalized into a single learning-unit input shape. The unit and its UI
  do not differentiate by source; the source is metadata only.
  *Captured in FR-1.*

- **R2 — User state persistence (was Q2).** User answers, scores, and
  checklist state live as **JSON columns on `learning_units`** — no
  companion tables. Matches M6 `project_maps` and M8 `diff_reviews`
  conventions; cheaper to evolve.
  *Captured in FR-8.*

- **R3 — Challenge stub schema (was Q3).** M7 ships **minimal stub
  fields only** (`challenge_concept`, `challenge_type`). M9 will add its
  full challenge schema in its own migration. M7 does not pre-allocate M9
  fields; the full M9 shape is M9's PRD to decide.
  *Captured in FR-7.*

- **R4 — Checklist gating (was Q4).** The review checklist surfaces
  progress; it does **not** gate the understanding-question score.
  product.md's "comprehension over completion" wins over checkbox
  enforcement.
  *Captured in FR-6.*

- **R5 — Entry-point IA (was Q5).** The user lands on a learning unit
  from a **per-repo issue list off the M11 imported-repo page** — no
  global cross-repo issues index in M7. A global index, if ever needed,
  is a follow-up.
  *Captured in FR-11.*

- **R6 — Score rollup (was Q6).** M7 stores scores strictly per-unit on
  `learning_units`. **M10 owns any cross-unit / per-repo rollup**; M7
  ships no rollup scaffolding.
  *Captured in NFR "Strictly per-unit scoring" below and Out of Scope.*
