---
name: llm-foundation
description: Shared Anthropic SDK foundation — operationalizes ADR 0005 with a server-side LLM client, key handling, and a CI-safe test strategy that M4 and M5 build on.
status: backlog
created: 2026-05-22T00:20:11Z
---

# PRD: llm-foundation

## Executive Summary

A shared, reusable Anthropic SDK foundation that operationalizes ADR 0005 ("LLM
Integration Architecture & LangChain Scope"). ADR 0005 already decided that the
product's core LLM features — M4 (recommendation explanations), M5 (stack
explainer), and M8 (diff review) — call the **Anthropic SDK directly** as
bounded prompt → structured-output calls. This epic builds the shared plumbing
those milestones need so none of them reinvents it: the official Anthropic SDK
installed in a new `packages/ai` workspace package, a server-side LLM client
wrapper, secure API-key handling, typed error handling, prompt caching, and a
CI-safe strategy for testing non-deterministic output.

It ships no end-user feature and introduces **no new architecture decision** —
the decision is ADR 0005. Its purpose is to remove duplicated SDK plumbing from
M4 and M5 and let those two epics run as clean parallel worktrees.

## Problem Statement

ADR 0005 settled *how* the product calls language models — the Anthropic SDK
directly, with prompt caching, tool use, and structured outputs — but the
codebase has no LLM integration yet: no SDK dependency, no API-key handling, no
client wrapper, and no way to test non-deterministic output deterministically
under the GitHub CI quality gate.

Building that plumbing independently inside M4 and M5 would duplicate the SDK
setup, the authentication, the error handling, and the test harness, and would
couple the two epics. A single shared foundation removes the duplication and
concentrates the new secret surface (an API key) and the new cost surface (paid
API calls) into one reviewed, well-tested place.

## User Stories

This is foundation/enabling work. Its direct users are the developers and AI
agents building M4 and M5 (and later M8); its indirect user is the job-seeking
junior dev whose coaching depends on LLM output being reliable and reviewable.

- **As an M4/M5 developer**, I can import a server-side LLM client and make a
  bounded prompt→structured-output call without re-implementing SDK setup, auth,
  model selection, or error handling.
  *Acceptance:* a documented module exports a typed call API; a smoke test
  proves a call runs end-to-end against a mocked SDK.

- **As an M4/M5 developer**, I can unit-test LLM-backed features so they pass
  deterministically in CI.
  *Acceptance:* the test strategy supplies mocked/recorded SDK responses; the CI
  test run makes zero live API calls and is reproducible.

- **As a maintainer**, I can run the app with no API key configured and get a
  clear, typed error instead of an unhandled crash.
  *Acceptance:* a missing or invalid key produces a typed, surfaced error;
  lint/typecheck/build still pass with no key set.

- **As a security reviewer**, I can confirm no API key is ever committed or
  exposed to the browser.
  *Acceptance:* the key is read only from `.env` server-side; `.env.example`
  documents the variable; `.env` stays git-ignored; no key reaches client code.

## Functional Requirements

- **FR-1 — Package + official install.** A new `packages/ai` workspace package
  with the official Anthropic SDK installed via its official installation
  method; the source URL and pinned version are recorded in a setup note.
- **FR-2 — Server-side LLM client wrapper.** A typed API for a bounded
  prompt → structured-output call, supporting the three capabilities ADR 0005
  names: prompt caching, tool use, and structured outputs.
- **FR-3 — Server-side only.** The client runs only server-side within the
  Next.js app (server actions / route handlers). The API key and the raw SDK
  are never bundled into client code.
- **FR-4 — Key handling.** The API key is read from `.env` through a validated
  config accessor; `.env.example` documents `ANTHROPIC_API_KEY`; absence is
  detected explicitly, not via a downstream crash.
- **FR-5 — Typed errors.** Missing key, rate limit, API failure, and timeout are
  mapped to typed errors and surfaced cleanly, mirroring the existing
  `packages/db/src/github` error-handling pattern.
- **FR-6 — CI-safe test strategy.** An injectable client plus mocked/recorded
  SDK responses let LLM-backed code be unit-tested without live API calls; the
  client wrapper ships with such tests.
- **FR-7 — Cost control.** Prompt caching is enabled by default; the default
  Claude model is documented and justified.
- **FR-8 — No new ADR.** This epic operationalizes ADR 0005 and references it as
  the governing decision; it records no new architecture decision.

## Non-Functional Requirements

- **Reproducible:** the CI suite never calls the live API; LLM tests are
  deterministic.
- **Secure:** no secret committed; key server-side only; never shipped to the
  browser.
- **Cost-aware:** prompt caching on by default; default model documented.
- **Consistent:** error handling and module shape match existing `packages/db`
  conventions so M4/M5 code feels native.
- **On-thesis:** a thin, reviewable wrapper — no opaque abstraction layer, per
  ADR 0005's reviewability rationale.

## Success Criteria

- The official Anthropic SDK appears in `packages/ai/package.json`; a setup note
  records its official source and version.
- The server-side LLM client wrapper is exported from `packages/ai` and
  exercised by a passing smoke test against a mocked SDK.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `pnpm test` all pass — and
  the test run succeeds with **no** API key set.
- The M4 and M5 epics can import the client with no further foundation work,
  recorded as a satisfied dependency in each epic.

## Constraints & Assumptions

- Governed by **ADR 0005**; this epic adds no new ADR.
- Tool installation follows official docs (milestone-plan rule + CLAUDE.md hard
  rule).
- Builds on the existing pnpm + Turborepo monorepo and the `apps/web` Next.js
  app; no new infrastructure.
- Assumes an Anthropic API key is available for local/dev runs; CI runs without
  one and must still pass.
- Defaults to the latest capable Claude models per current Anthropic guidance.

## Out of Scope

- M4, M5, and M8 feature logic and their prompts.
- Any agent framework or autonomous agent loop — ADR 0005 confines agentic work
  to M6 (Project Logic Mapper) on LangGraph.
- LangChain / LangGraph — ADR 0005 scopes those to M6 only.
- Any UI work.
- Persistence schemas for recommendations or explanations (owned by M4/M5).
- Live-API integration tests, evals, or multi-provider abstraction.

## Dependencies

- Existing `apps/web` Next.js app and the `packages/*` workspace.
- An Anthropic API key provisioned in `.env` for development.
- Governed by **ADR 0005** (no new ADR required).
- Downstream: the `recommendation-engine` (M4) and `stack-explainer` (M5) epics
  depend on this foundation.
