---
name: llm-foundation
status: completed
created: 2026-05-22T00:20:11Z
updated: 2026-05-22T00:24:36Z
progress: 100%
prd: .claude/prds/llm-foundation.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/71
---

# Epic: llm-foundation

## Overview

Build the shared Anthropic SDK foundation that operationalizes ADR 0005. ADR
0005 already decided that the product's core LLM features call the Anthropic SDK
directly as bounded prompt → structured-output calls; this epic delivers the
shared plumbing — the official SDK in a new `packages/ai` workspace package, a
server-side LLM client wrapper, secure API-key handling, typed error handling,
and a CI-safe test strategy — so M4 and M5 do not reinvent it. It ships no
end-user feature and records no new architecture decision.

## Architecture Decisions

- **No new ADR.** ADR 0005 ("LLM Integration Architecture & LangChain Scope") is
  the governing decision: Anthropic SDK directly for M4/M5/M8, LangChain confined
  to M6. This epic only operationalizes it.
- **New `packages/ai` workspace package**, sibling to `packages/db` — a shared
  library importable by `apps/web`, built through the existing Turborepo
  pipeline.
- **Server-side only.** The client is invoked from Next.js server actions and
  route handlers. The API key and the raw SDK are never bundled into client
  code.
- **Injectable SDK client.** Calls go through an injectable client interface so
  tests substitute a mock; CI runs with no `ANTHROPIC_API_KEY` and makes zero
  live calls.
- **Thin wrapper, not an abstraction layer.** A minimal, reviewable wrapper —
  per ADR 0005's reviewability rationale; no agent framework, no LangChain.
- **Official install only.** The Anthropic SDK is installed via its official
  method; source URL and pinned version are recorded in a setup note.

## Technical Approach

### Frontend Components

None. This epic has no UI and uses no Claude Design.

### Backend Services

- `packages/ai/` package scaffold (package.json, tsconfig, Turborepo wiring).
- Validated config accessor that reads `ANTHROPIC_API_KEY` from `.env` and fails
  explicitly when absent.
- Server-side LLM client wrapper: a typed API for a bounded
  prompt → structured-output call, supporting prompt caching, tool use, and
  structured outputs.
- Typed error module (missing key, rate limit, API failure, timeout), mirroring
  the `packages/db/src/github` error pattern.
- Mock SDK client + fixture harness for deterministic unit tests.

### Infrastructure

- Official Anthropic SDK dependency added to `packages/ai/package.json`.
- `.env.example` documents `ANTHROPIC_API_KEY`; `.env` stays git-ignored.
- No new runtime infrastructure; reuses pnpm + Turborepo.

## Implementation Strategy

Sequential keystone: the package scaffold and SDK install come first, then the
client wrapper and error module, then the test harness. The foundation docs can
be written in parallel with the test harness once the client API is defined. The
epic is intentionally small so the two dependent epics start as soon as
possible. No ADR task — ADR 0005 already governs.

## Task Breakdown Preview

1. **Install Anthropic SDK + scaffold `packages/ai/`** — package wiring,
   `.env.example` entry, validated config accessor. No dependencies.
2. **Server-side LLM client wrapper + typed error module** — bounded
   prompt→structured-output API. Depends on 1.
3. **CI-safe test harness** — mock SDK client, fixtures, client smoke test.
   Depends on 2.
4. **Foundation docs** — setup note + usage README so M4/M5 can consume the
   client. Depends on 2; runs in parallel with task 3.

Parallelization: tasks 1→2 are a sequential chain; tasks 3 and 4 run in parallel
after task 2.

## Dependencies

- No external epic dependencies — this is a foundation.
- Governed by ADR 0005; no new ADR required.
- An Anthropic API key in `.env` for local/dev runs; CI runs without one.
- Downstream: the `recommendation-engine` and `stack-explainer` epics depend on
  this epic.

## Success Criteria (Technical)

- The official Anthropic SDK is present in `packages/ai/package.json`; official
  source and pinned version recorded in a setup note.
- The server-side LLM client wrapper is exported from `packages/ai` and
  exercised by a passing smoke test against the mock SDK.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` all pass with no API
  key set.
- A usage README lets the M4/M5 epics import the client with no further
  foundation work.

## Estimated Effort

Small — 4 tasks, no UI, no ADR. The critical path is the chain 1→2→3; task 4
overlaps task 3. This is the shortest of the three epics and must land before
M4/M5 LLM work begins.

## Tasks Created
- [ ] #72 - Install Anthropic SDK + scaffold packages/ai (parallel: false)
- [ ] #73 - Server-side LLM client wrapper + typed error module (parallel: false)
- [ ] #74 - CI-safe test harness (parallel: true)
- [ ] #75 - Foundation docs — setup note + usage README (parallel: true)

Total tasks: 4
Parallel tasks: 2 (003, 004 — after 002)
Sequential tasks: 2 (001 → 002)
Estimated total effort: 19 hours
