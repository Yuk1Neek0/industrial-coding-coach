# M13 — LLM Observability

**State:** ✅ Complete — epic #218 done; merged to `main` via **PR #239**
(`a54b9ac`) · **Date:** 2026-06-03

Goal: give the coach **LLM observability** in two complementary ways over one
local-first data model — **dogfood** the product's own bounded SDK calls (traces
+ a lightweight eval) and **coach the user** about their imported repo's
observability story — Langfuse-*shaped* but with **zero Langfuse dependency**.

## Scope decisions

- **Two halves, one data model.** Part A instruments the coach's own bounded
  calls (M7/M9/M10); Part B detects + teaches the imported repo's observability
  story. Both surface on one page `/observability/[owner]/[repo]`.
- **Local-first, view needs nothing (ADR 0009).** Traces/evals are read from the
  local SQLite store; Part B is derived on read from `repo_files`. Viewing needs
  no Langfuse account, no network, no `ANTHROPIC_API_KEY`. The only SDK access is
  the *underlying* bounded calls themselves.
- **Best-effort, zero behaviour change (AD-2).** Instrumentation wraps the
  `LlmClient.complete()` seam; every observability write is swallowed on failure
  and never alters the wrapped call's result, ordering, or latency.
- **Eval reuses the existing integrity checks (AD-3).** No LLM-as-judge; the eval
  is the call's own file/stack integrity check (no new SDK call).
- **Cost is a dated estimate (AD-4).** A static per-model price table turns token
  `usage` into a clearly-labelled estimate; exact billing is out of scope.
- **Langfuse-shaped, zero dependency (AD-6).** trace / observation / score
  concepts with a documented export seam; no Langfuse dependency, account, or
  network export ships in M13.

## Stage status

| Stage | Description | Status |
|---|---|---|
| 1 | CCPM Plan — PRD `llm-observability.md` | Done — approved (PR #228) |
| 2 | CCPM Epic → Structure → Sync | Done — epic #218, tasks #219–#227 |
| 3 | Execution + UI hand-off | Done — see backlog |

## Execution backlog

| Wave | Issue | Task | Closing PR |
|---|---|---|---|
| 1 | #219 | Observability schema + Drizzle migration `0011` (`llm_traces` + `llm_evals`) | #231 |
| 1 | #220 | Deterministic dated per-model cost estimator | #230 |
| 1 | #221 | Repo observability analyzer (Part B detection) | #232 |
| 2 | #222 | Recording `LlmClient` decorator + `recordEval` (best-effort, non-blocking) | #234 |
| 2 | #223 | Part-B repo observability teaching (deterministic, no LLM) | #233 |
| 3 | #224 | Instrument the M7/M9/M10 bounded calls (zero behaviour change) | #236 |
| 3 | #225 | Typed observability data-access (`getObservability`) | #235 |
| 3 | #226 | Observability page — Page Spec + Claude Design prompt | #237 |
| 3 | #227 | Integrate the Observability page into `apps/web` | #238 |

All 9 task issues + epic #218 are closed; the epic is archived to
`.claude/epics/archived/llm-observability/`. Merged to `main` via **PR #239**.

## Delivered

- `packages/db/src/observability/` — `cost.ts` (dated per-model cost estimator),
  `detect.ts` (pure Part-B LLM-app analyzer over `repo_files`), `teaching.ts`
  (deterministic parameterized teaching: tracing / failures / evals + the
  `absent` explainer), `record.ts` (`createObservedLlmClient` decorator +
  `recordEval`, best-effort/non-blocking), `index.ts` (the `getObservability`
  data-access layer). Exported via a new `./observability` subpath.
- `packages/db/src/schema.ts` — `llm_traces` (one per logical bounded call:
  model, aggregate tokens, estimated cost, latency, typed outcome, per-turn JSON
  observations) + `llm_evals` (graded checks) + migration `0011`.
- M7/M9/M10 bounded calls now construct `createObservedLlmClient(...)` when a db
  is available and `recordEval(...)` after their existing integrity check —
  zero behaviour change (their suites stay green).
- Observability UI: `/observability/[owner]/[repo]` — a Server Component over the
  M13 DAL (read-only, offline), Part A (traces + per-call aggregates + dated cost
  estimate) + Part B (the repo observability story + teaching), built from a Page
  Spec (ADR 0007) — see
  `docs/design/ui-integration-notes/observability-page.md`.

## Acceptance Criteria (PRD)

- [x] After a M7/M9/M10 bounded call, a trace row exists with model, token
      counts, an estimated cost, latency, and a typed outcome — verified by test.
- [x] A failing call (integrity rejection / forced failure) produces a trace +
      an eval with `passed: false` — verified by test.
- [x] Instrumentation is **non-blocking**: with the observability write forced to
      throw, the underlying call still returns its normal result — verified by test.
- [x] An LLM-app fixture yields a detected story naming the real SDK + call sites;
      a non-LLM fixture yields the "no LLM app detected" state — verified by tests.
- [x] Viewing traces/evals/analysis makes **zero** network calls and needs no API
      key (the page + DAL are offline) — asserted by test + the `web` build/test.
- [x] All new deterministic modules ship with passing Vitest; CI green.

## Retrospective

**What went well**

- **Reuse-first, one-line instrumentation.** The `@workspace/ai` client already
  returned token `usage`; instrumenting was a recording decorator at the
  `complete()` seam, so M7/M9/M10 changed only their client construction + one
  `recordEval`. Eval reused the existing integrity checks (no new LLM call); Part
  B mirrored the M12 analyze-and-teach pattern.
- **Non-blocking proven, not just claimed.** The `safeWrite` guarantee is
  centralized in `record.ts` and asserted by a test that forces the recorder DB
  to throw and checks the underlying call still returns its result.
- **Zero behaviour change held.** The full `@workspace/db` suite (incl. the
  unchanged M7/M9/M10 suites — 791 tests) stayed green through the instrumentation
  task, proving the wrapped calls behave identically.
- **Parallel waves, fast wall-clock.** Wave-1 (schema / cost / analyzer) and the
  Wave-2/3 backend tasks ran as background sub-agents on disjoint files; only the
  delicate instrumentation task (#224) was hand-done for local-suite verification.

**What to watch — lessons**

- **`wrap-when-db-present` keeps instrumentation invisible.** A bounded call is
  wrapped only when a `db` is in scope — so omitting `db` runs exactly as before
  (no trace, no `catalog.db` pollution from tests), and `recordEval` is passed the
  call's own `db` so the eval lands beside its trace.
- **Local Vitest is unreliable in fresh worktrees on Windows.** Cold/isolated
  pnpm worktrees fail to *boot* Vitest 4 (`ERR_PACKAGE_IMPORT_NOT_DEFINED:
  "#module-evaluator"`) and Turbopack can't resolve `@langchain/langgraph` there;
  both are environment-only (the main checkout + Linux CI are green). Treat
  **typecheck + lint locally + CI as the gate**; verify Vitest in the main checkout.
- **Spec ↔ shape drift avoided** by binding the page to the shipped
  `packages/db/src/observability` types and recording a no-drift check in the
  integration notes (the standing M8 retro lesson).

**Follow-ups**

- **M7 `generateLearningUnit` / `gradeLearningUnit` have no production callers yet**
  (library functions with tests only). They gained optional `snapshotId?`/`db?`
  and the instrumentation seam is in place + tested; production traces activate
  when a caller threads `db`.
- **No header `ref` badge** on the page — `getObservability` exposes `snapshotId`
  but not the resolved `ref` string; a future DAL tweak could surface it.
- **A global cross-repo trace dashboard** (vs the per-repo page) is a deferred
  follow-up, as is a real Langfuse **export adapter** (the schema is export-ready;
  it would follow the official-docs install rule + a human-approved ADR).
- The unifying primary-nav pass across M7–M13 remains unscoped; each milestone's
  chrome still carries its own `AppNav` copy (now incl. an "Observability" entry).
