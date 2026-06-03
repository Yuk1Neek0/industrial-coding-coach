---
name: llm-observability
status: completed
created: 2026-06-02T18:22:30Z
updated: 2026-06-03T19:16:54Z
progress: 100%
prd: .claude/prds/llm-observability.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/218
---

# Epic: llm-observability

## Overview

A local-first, Langfuse-shaped LLM observability layer with two halves over one
shared data model: **Part A** instruments the coach's own bounded SDK calls
(M7/M9/M10) to emit traces + lightweight evals, and **Part B** detects and
teaches the *imported repo's* observability story. Both surface on one per-repo
page. No cloud, no external service, no Langfuse dependency (ADR 0009).

The work is **reuse-first**: the `@workspace/ai` client already returns token
`usage`; the bounded calls are multi-turn tool-use loops that map cleanly onto
Langfuse's trace/observation/score model; eval reuses the *existing* integrity
checks (no new LLM call); Part B mirrors the M12 deterministic analyze + teach
pattern.

## Architecture Decisions

- **AD-1 — Instrument at the `LlmClient.complete()` seam via a recording
  decorator.** A new `createObservedLlmClient({ traceName, snapshotId, db })`
  wraps `@workspace/ai`'s `createLlmClient()`: each `complete()` turn records an
  **observation** (model, input/output/cache tokens, latency, outcome); the turns
  aggregate into one **trace** per logical bounded call. M7/M9/M10 change one line
  (client construction) — no rewrite. trace → observation → score maps to
  Langfuse exactly (AD-6).

- **AD-2 — Best-effort, non-blocking (NFR zero-behavior-change).** Every
  observability write is wrapped so a failure (DB busy, etc.) is swallowed +
  logged and **never** alters the underlying call's result, ordering, or latency
  path. The decorator returns the inner client's `LlmResult` unchanged.

- **AD-3 — Eval reuses the existing integrity checks (no LLM-as-judge).** Each
  bounded call already runs a file/stack-reference integrity check; M13 adds a
  small `recordEval(traceId, { check, passed, reason })` the call invokes after
  its check. No new SDK call (PRD Out of Scope).

- **AD-4 — Cost is a deterministic, dated estimate.** A static per-model price
  table (input/output/cache rates) turns `usage` into an estimated cost, clearly
  labelled an estimate and versioned by date. Exact billing is out of scope.

- **AD-5 — Part B is a separate deterministic analyzer, derived-on-read.** An
  analyzer over `repo_files` detects LLM-app signals (AI SDK imports, model-call
  sites, prompt assets, existing observability/eval tooling) → a typed
  "observability story"; a deterministic parameterized teaching layer + a
  graceful "no LLM app detected" state. Like the M12 graph, it is pure and
  re-derived on read — **no persistence** for Part B.

- **AD-6 — Langfuse-shaped, export-ready, zero dependency.** The schema +
  data-access use trace / observation / score concepts and leave a documented
  export seam. M13 ships **no** Langfuse dependency, account, or network export.
  (If real export is added later: official-docs install + a human-approved ADR.)

- **AD-7 — One per-repo surface; new module namespace.** All backend lands under
  `packages/db/src/observability/`. The UI is one page `/observability/[owner]/[repo]`
  showing both halves: Part A's traces/evals/cost for that repo's coach calls,
  and Part B's repo observability story. A global cross-repo trace dashboard is a
  deferred follow-up. Page finalized in the Page Spec (CLAUDE.md v0/Claude Design rule).

## Technical Approach

### Frontend Components

- **`apps/web/app/observability/[owner]/[repo]/`** — a Server Component reading
  the typed data-access layer: a traces/evals/cost panel (Part A) + the repo
  observability story panel with teaching (Part B), or the degradation state.
  Read-only, offline. Built from a Page Spec via Claude Design (ADR 0007).

### Backend Services (`packages/db/src/observability/`)

- **`record.ts`** — `createObservedLlmClient(...)` decorator + `recordEval(...)`;
  best-effort writes of traces/observations/evals (AD-1/2/3).
- **`cost.ts`** — pure dated per-model cost estimator from `usage` (AD-4).
- **`detect.ts`** — pure Part-B analyzer over `repo_files` → typed observability
  story (AD-5).
- **`teaching.ts`** — pure parameterized Part-B teaching + degradation.
- **`index.ts`** — typed data-access (`getObservability(owner, repo, ref?)`):
  traces + per-call eval pass-rates + cost/latency aggregates + the Part-B story;
  offline (no network, no live FS).

### Infrastructure

- **`packages/db/src/schema.ts`** — `llm_traces` (one per logical call: name,
  snapshotId, model, aggregate tokens, estimated cost, latency, outcome,
  startedAt, JSON per-turn observations) + `llm_evals` (traceId FK, check,
  passed, reason). Drizzle migration `0011`. M13 runs solo on `packages/db`.
- **M7/M9/M10 bounded calls** — swap `createLlmClient()` →
  `createObservedLlmClient(...)` + add one `recordEval(...)` after each integrity
  check. Zero behavior change.

## Implementation Strategy

Three waves (independent, non-conflicting tasks as background sub-agents per
ADR-0008):

- **Wave 1 (parallel):** schema+migration, cost estimator, Part-B analyzer —
  disjoint files.
- **Wave 2:** recording decorator + `recordEval` (after schema + cost); Part-B
  teaching (after analyzer) — parallel.
- **Wave 3:** instrument the bounded calls (after the decorator); data-access
  (after schema + analyzer + teaching); Page Spec (after data shape); integrate
  the page (after data-access + Page Spec).

Each task: bounded, AI self-review, local verification (`pnpm lint/build/typecheck`
+ Vitest), PR, CI, human review.

## Task Breakdown Preview

1. **Observability schema + migration** — `llm_traces` + `llm_evals` + types +
   migration `0011`. *(parallel; no deps)*
2. **Cost estimator** (`observability/cost.ts`) — dated per-model price table,
   pure + tests. *(parallel; no deps)*
3. **Repo observability analyzer** (`observability/detect.ts`) — Part-B LLM-app
   detection from `repo_files`, pure + tests. *(parallel; no deps)*
4. **Recording decorator + recordEval** (`observability/record.ts`) — observed
   `LlmClient`, best-effort non-blocking; writes traces/observations/evals.
   *(deps: 1, 2)*
5. **Part-B teaching** (`observability/teaching.ts`) — deterministic parameterized
   teaching + degradation over the analyzer output. *(deps: 3)*
6. **Instrument the bounded calls** — wire the observed client + `recordEval` into
   M7/M9/M10; zero behavior change; tests assert traces/evals emitted + a forced
   write failure is non-blocking. *(deps: 4)*
7. **Typed data-access layer** (`observability/index.ts`) — `getObservability(...)`
   composing traces + eval pass-rates + cost/latency aggregates + the Part-B
   story; offline. *(deps: 1, 3, 5)*
8. **Observability page — Page Spec + Claude Design prompt** under `docs/design/`.
   *(deps: 7 for shape; can overlap Wave 2/3)*
9. **Integrate the Observability page** into `apps/web`
   (`/observability/[owner]/[repo]`). *(deps: 7, 8)*

Target: **9 tasks** (≤10) — 1 migration, ~5 deterministic/wrapper backend modules
(reusing the `@workspace/ai` client + existing integrity checks), 1 data-access
layer, 1 Page Spec, 1 UI integration.

## Dependencies

- **`@workspace/ai`** — the `LlmClient` (`complete()` returns `usage`) the
  decorator wraps.
- **M7 / M9 / M10** — the bounded calls to instrument + their integrity checks
  (the eval signal).
- **M11** — `repo_files` snapshot read for Part-B detection.
- **M12** — the deterministic-teaching + typed-data-access + per-repo-page pattern.
- **packages/db (Drizzle)** — schema + migration.
- External: **none new** (no Langfuse, no hosted service).

## Success Criteria (Technical)

- Running any M7/M9/M10 bounded call writes a trace (model, aggregate tokens,
  estimated cost, latency, typed outcome) + an eval (passed + check) — test.
- A forced observability-write failure leaves the underlying call's result
  unchanged (non-blocking) — test.
- An LLM-app fixture yields a detected observability story naming the real SDK +
  call sites; a non-LLM fixture yields the "no LLM app detected" state — tests.
- `getObservability(...)` and the page make **zero** network calls and need no
  API key — asserted.
- New `observability/` modules ship with passing Vitest; CI green; M7/M9/M10
  behavior unchanged (their existing suites stay green).

## Estimated Effort

Medium. ~9 bounded tasks: 1 migration, a recording decorator + cost estimator +
Part-B analyzer/teaching (all reusing existing client/checks), 1 data-access
layer, 1 Page Spec, 1 UI integration. No new external tooling. Critical paths:
1/2 → 4 → 6 (instrumentation) and 3 → 5 → 7 → 8 → 9 (surface); Wave-1 parallelism
and Wave-2/3 overlap compress wall-clock.

## Tasks Created
- [x] #219 - Observability schema + Drizzle migration (parallel: true)
- [x] #220 - Deterministic per-model cost estimator (parallel: true)
- [x] #221 - Repo observability analyzer (Part B detection) (parallel: true)
- [x] #222 - Recording LlmClient decorator + recordEval (parallel: true, deps: 1,2)
- [x] #223 - Part-B repo observability teaching (parallel: true, deps: 3)
- [x] #224 - Instrument the M7/M9/M10 bounded calls (parallel: true, deps: 4)
- [x] #225 - Typed observability data-access layer (parallel: true, deps: 1,3,5)
- [x] #226 - Observability page — Page Spec + Claude Design prompt (parallel: true, deps: 7)
- [x] #227 - Integrate the Observability page into apps/web (parallel: false, deps: 7,8)

Total tasks: 9
Parallel tasks: 8 (001–008 — gated by deps, conflict-free)
Sequential tasks: 1 (009 — final UI integration)
Estimated total effort: 41 hours

Dependency waves:
- Wave 1 (no deps): 001, 002, 003
- Wave 2: 004 (←1,2), 005 (←3)
- Wave 3: 006 (←4), 007 (←1,3,5), 008 (←7), 009 (←7,8)
