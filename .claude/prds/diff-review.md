---
name: diff-review
description: M8 — a bounded Anthropic SDK call reviews an AI-generated PR (changed-file + core-logic explanation, risk analysis, test suggestions, comprehension questions) and grades the user's answers into a score + weak areas; reviews persist to SQLite.
status: backlog
created: 2026-05-22T13:47:16Z
---

# PRD: diff-review

## Executive Summary

Milestone 8. The Diff Review and Understanding Check takes an AI-generated
change — a pull request on the user's imported repository — and helps a
job-seeking junior dev understand what changed, and then *prove* they
understand it.

It fetches the PR through the M11 GitHub client (ADR 0009), then produces a
per-changed-file explanation, a core-logic explanation, a risk analysis, test
suggestions, and comprehension questions targeted at the actual diff. The user
answers those questions and M8 grades them into a score and a weak-area
breakdown.

Per **ADR 0005**, M8 is a **bounded Anthropic SDK call** — prompt → structured
output, with tool use to read specific PR files — not an autonomous agent and
not LangChain (LangChain is confined to M6). It builds on the `llm-foundation`
shared client. Reviews, the user's answers, and scores persist to the existing
SQLite database so they are revisitable. The Diff Review page, Risk Analysis
Panel, Understanding Check UI, and Score / Weak Area UI are produced through the
Claude Design round-trip (ADR 0007).

## Problem Statement

A junior dev who builds with heavy AI assistance receives most changes as
AI-generated pull requests, and merges them without fully understanding what
they did. In an interview they cannot explain what a change accomplished or
why, cannot spot the risks an AI quietly introduced, and have no way to check
their own understanding before claiming the work as theirs.

Passively accepting AI output is the exact habit this product exists to break.
Reviewing a diff properly means explaining each changed file, the core logic,
and the risks — grounded in the real diff — and then testing the user's own
comprehension rather than letting them assume it. Per ADR 0005 this is a
bounded prompt → structured-output call on the Anthropic SDK; the agentic
codebase-understanding work is M6, not here.

## User Stories

- **As a junior dev**, I select a pull request on my imported repo and get an
  explanation of each changed file.
  *Acceptance:* every changed file in the PR has an explanation; file references
  resolve to real PR paths.

- **As a junior dev**, I get a core-logic explanation of what the change does as
  a whole.
  *Acceptance:* the explanation references the actual diff, not generic text.

- **As a junior dev**, I get a risk analysis of bugs or risks the change may
  introduce.
  *Acceptance:* each risk is tied to a specific changed file or hunk.

- **As a junior dev**, I get test suggestions for the change.
  *Acceptance:* each suggestion references behavior that the diff changed.

- **As a junior dev**, I get comprehension questions targeted at this change.
  *Acceptance:* questions reference the actual diff, not generic review trivia.

- **As a junior dev**, I answer the questions and get a score and weak areas.
  *Acceptance:* my answers are graded; a score and a weak-area breakdown are
  produced and stored.

- **As a developer**, reviews and answers are saved and retrievable.
  *Acceptance:* a `diff_reviews` table stores the review, and the user's answers
  and score; a data-access layer and tests cover them.

- **As a job-seeking junior dev**, the review lets me defend the change.
  *Acceptance:* from the review a user can explain what changed and why and
  identify possible bugs or risks — the M8 milestone acceptance.

## Functional Requirements

- **FR-1 — PR input.** M8 fetches a pull request from the user's imported
  repository — its diff/patch, changed-file list, and linked issue where one
  exists. PR fetching is added to the existing M11 GitHub client, reusing its
  authentication and access path (ADR 0009); no second GitHub access path.
- **FR-2 — Change model.** A typed model of the change: changed files, hunks,
  additions/deletions, the linked issue's acceptance criteria where available,
  and any relevant specs.
- **FR-3 — Review call.** A bounded Anthropic SDK call, built on the
  `llm-foundation` client, produces typed, structured output: a changed-file
  explanation, a core-logic explanation, a risk analysis, test suggestions, and
  comprehension questions. It uses tool use to read specific PR files and
  structured outputs; it is a bounded call, not an autonomous agent.
- **FR-4 — Project-tied output.** Every explanation and risk references the
  actual diff; file references resolve to real PR paths. No generic review text.
- **FR-5 — Understanding check.** The user answers the generated comprehension
  questions; a bounded grading call scores the answers and produces a numeric
  score and a weak-area breakdown.
- **FR-6 — Persistence.** A `diff_reviews` table — with the user's answers and
  score — added via a Drizzle migration to the existing SQLite database
  (ADR 0006), keyed by repo and PR number; structured/list-valued fields as JSON
  columns. No new database.
- **FR-7 — Data-access layer.** A typed module to create, read, and update diff
  reviews and to store the user's answers and scores server-side.
- **FR-8 — UI via Claude Design.** A Diff Review page, a Risk Analysis Panel, an
  Understanding Check UI, and a Score / Weak Area UI — each preceded by a Page
  Spec under `docs/design/` and a prompt under `docs/design/ui-prompts/` before
  any Claude Design generation (ADR 0007).

## Non-Functional Requirements

- **Reproducible:** the review and grading calls are tested with
  mocked/recorded SDK responses per the `llm-foundation` test strategy; the
  GitHub PR fetch is tested with mocked responses. CI makes no live API calls.
- **Project-grounded:** file references are validated against the PR's
  changed-file set by an integrity check.
- **Non-duplicative:** reuses the M11 GitHub client and the `llm-foundation`
  client; no second GitHub or SDK path.
- **Fair grading:** grading produces a typed, reproducible score and weak-area
  breakdown and is covered by the test strategy.
- **Resilient:** a very large PR, or a PR with no linked issue, degrades
  gracefully rather than failing.

## Success Criteria

- Given a sample PR on an imported repo, M8 produces all six outputs grounded
  in the real diff.
- The user can answer the comprehension questions and receive a score and a
  weak-area breakdown.
- The `diff_reviews` table (with answers and score), its migration, the
  data-access layer, and tests land.
- The four UI pieces are integrated into `apps/web` and wired to the reviewer.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` all pass — with no
  API key set.
- A user can explain what changed and why, identify possible bugs or risks, and
  receives targeted review questions (the M8 milestone acceptance).

## Constraints & Assumptions

- The LLM mechanism is fixed by **ADR 0005**: a bounded Anthropic SDK call —
  not an autonomous agent, and not LangChain (LangChain is confined to M6).
- GitHub access is governed by **ADR 0009**; M8 reuses the M11 GitHub client.
- Reuses the existing SQLite database (ADR 0006) — new tables, no new database.
- UI uses Claude Design (ADR 0007), only after page specs exist.
- Depends on the `llm-foundation` client and M11 `github-integration` — both
  shipped.
- Assumes the user's imported repository has at least one pull request to
  review.

## Out of Scope

- Importing repositories (owned by M11).
- M6 Project Logic Mapper, M7 Issue-Based Learning Workspace, M9 Debug &
  Expansion Challenges, and M10 Learning Memory & Portfolio Export.
- LangChain or any agentic pipeline — ADR 0005 confines those to M6.
- Reviewing arbitrary local working-tree diffs not tied to a pull request — M8
  reviews PRs.
- Auto-merging, approving, or modifying the reviewed pull request.
- LLM observability / tracing — that is M13.
- A long-term, spaced-repetition learning model over scores — that is closer to
  M10 Learning Memory.

## Dependencies

- **M11 `github-integration`** — the GitHub client, repository identity, and
  ADR 0009 access path; extended here with PR fetching (shipped).
- **`llm-foundation`** — the shared Anthropic SDK client for the review and
  grading calls (shipped).
- Governed by **ADR 0005** (LLM mechanism), **ADR 0006** (storage), **ADR 0007**
  (UI tool), and **ADR 0009** (GitHub access).
- The existing `apps/web` Next.js app.
