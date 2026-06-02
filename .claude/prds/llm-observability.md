---
name: llm-observability
description: A local-first, Langfuse-shaped LLM observability layer — instrument the coach's own bounded SDK calls (traces + lightweight eval) and coach the user on their imported repo's observability story.
status: backlog
created: 2026-06-02T18:14:16Z
---

# PRD: llm-observability

## Executive Summary

M13 gives the coach **LLM observability** in two complementary ways, over one
shared local-first data model:

- **Part A — Dogfood (instrument our own calls).** The product's existing
  bounded Anthropic SDK calls (M7 generate/grade, M9 generate/grade, M10 Q&A /
  résumé bullets) are wrapped so every call records a **trace** — model, token
  counts, estimated cost, latency, and a typed success/failure outcome — plus a
  **lightweight eval result** derived from the call's *existing* integrity check.
  This makes the coach's own AI usage transparent (cost + reliability), on-thesis
  with ADR 0005 ("AI-generated, said plainly").
- **Part B — Coach the user about *their* repo's observability.** Extending the
  M5/M6 analysis line, the coach detects whether an imported repo is an LLM app
  (SDK imports, model calls, prompt assets), surfaces what observability it does
  / doesn't have, and **teaches** the concepts — so the user can answer "how
  would you monitor and evaluate this in production?" in an interview.

Per the local-first thesis (ADR 0009), traces and evals are written to the local
SQLite store — **no cloud, no external service**. The trace schema is
deliberately **Langfuse-shaped** so a future export adapter is a small add, but
M13 takes **no dependency on Langfuse** (or any hosted service).

## Problem Statement

Two gaps:

1. **The coach's own AI usage is a black box.** The product makes several bounded
   SDK calls but surfaces nothing about their cost, latency, or reliability. A
   user (and a maintainer) cannot see "how much did that cost / how often does it
   fail / how is quality trending" — and a product that *coaches* AI transparency
   should model it.
2. **Junior devs can't speak to observability.** "How would you monitor this LLM
   app? How do you know it's working — what would you evaluate?" is a common
   interview question for AI-app roles. A user who vibe-coded an LLM app rarely
   instrumented it and can't describe the observability/eval story — there's
   nothing in the coach today that builds that literacy against their real repo.

M13 closes both with one local-first observability layer: real traces + evals for
the coach's own calls, and a detection-and-teaching surface for the user's repo.

## User Stories

### US-1 — See the coach's own AI usage (Part A, traces)
**As** a user (or maintainer) of the coach,
**I want** to see a trace for each bounded SDK call the product made — model,
tokens, estimated cost, latency, and whether it succeeded,
**so that** the coach's AI usage is transparent and I can reason about cost and
reliability.

**Acceptance criteria:**
- Every bounded SDK call (M7/M9/M10) records a trace row with: a stable call
  name, model id, input/output token counts, an estimated cost, latency (ms),
  start time, and a typed outcome (`success` | a failure kind).
- A failed call (LLM error, integrity rejection, missing key) records a trace
  with the failure kind — failures are observed, not swallowed.
- Recording a trace is **non-blocking and best-effort**: an observability write
  failure never changes the behavior or result of the underlying SDK call.

### US-2 — See a lightweight quality signal per call (Part A, eval)
**As** a user,
**I want** each traced call annotated with a lightweight **eval result** derived
from its existing integrity check (passed/failed + which check),
**so that** I can see output-quality trends without a separate LLM judge.

**Acceptance criteria:**
- Each call that runs an integrity check (M7/M9/M10/M12-style file/stack
  reference checks) records an eval result: `passed: boolean`, the check name,
  and a short reason on failure.
- Eval results reuse the **existing** integrity checks — M13 adds **no new LLM
  call** to evaluate (no LLM-as-judge in MVP).
- Eval results aggregate to a simple per-call-name pass-rate the UI can trend.

### US-3 — Understand my imported repo's observability story (Part B, detect + teach)
**As** a junior dev whose imported repo is an LLM app,
**I want** the coach to detect the repo's LLM usage and explain its observability
/ eval story (what's there, what's missing) in plain language,
**so that** I can speak to "how would you monitor and evaluate this?" in an
interview.

**Acceptance criteria:**
- The coach detects LLM-app signals in the imported snapshot deterministically:
  AI SDK imports (`anthropic`, `openai`, …), model-call sites, prompt assets, and
  any existing observability/eval tooling (e.g. Langfuse, OpenLLMetry, evals dir).
- It produces a beginner-first explanation tied to the **real repo** (which files,
  which SDK) — never generic boilerplate — covering what observability the repo
  has and what a production setup would add (tracing, cost, evals).
- When no LLM usage is detected, it degrades to a clear "no LLM app detected here"
  state with a short explainer (not an error).

### US-4 — Local-first and free to view (NFR as a story)
**As** a user,
**I want** all of this to work locally with no external account or key just to
view,
**so that** observability never sends my data to a third party.

**Acceptance criteria:**
- Traces, evals, and repo-observability analysis are stored in and read from the
  local SQLite store; viewing requires no Langfuse account, no network, and no
  `ANTHROPIC_API_KEY`.
- The only network/SDK access is the *underlying* bounded calls themselves (which
  already exist) — M13's observability layer issues none of its own.

## Functional Requirements

### FR-1 — Local-first observability data model
A SQLite schema for **traces** (one per bounded SDK call) and **eval results**
(zero or more per trace), Langfuse-shaped (trace / observation / score concepts)
so a future export adapter maps cleanly. Includes a Drizzle migration.

### FR-2 — Trace recording wrapper
A small wrapper around the shared `llm-foundation` SDK client (or a recording
hook) that captures model, token usage, estimated cost, latency, and outcome for
each bounded call, and writes a trace. Best-effort and non-blocking (FR-7).

### FR-3 — Instrument the existing bounded calls
Wire the wrapper into the M7 / M9 / M10 bounded calls so they emit traces +
eval results in production, **without changing their outputs**.

### FR-4 — Eval results from existing integrity checks
Record an eval result per call from its existing integrity check (passed + check
name + reason). No new LLM call.

### FR-5 — Cost estimation
A deterministic per-model token→cost estimator (a small static price table) so
traces carry an estimated cost. The table is versioned/dated and clearly labelled
an estimate.

### FR-6 — Repo observability detection + teaching
A deterministic analyzer over the imported snapshot that detects LLM-app signals
and produces a typed "observability story" (detected SDKs, call sites, prompt
assets, existing tooling) + a beginner-first teaching layer, with a graceful
"no LLM app detected" state.

### FR-7 — Non-blocking observability
Observability writes are best-effort: any failure (DB busy, etc.) is swallowed
and logged, never propagated to the underlying call's result or latency path.

### FR-8 — Typed data-access layer
A typed read API exposing: traces (filter by call name / time), per-call-name
eval pass-rates + cost/latency aggregates, and the repo observability story —
for the UI to consume via a Server Component / Server Action.

### FR-9 — Langfuse-shaped, export-ready (no dependency)
The schema and data-access use Langfuse-compatible concepts (trace / observation
/ score) and leave a documented seam for a future export adapter. M13 ships **no**
Langfuse dependency and **no** hosted integration.

## Non-Functional Requirements

- **Local-first (ADR 0009):** no external service, no Langfuse account, no
  network from the observability layer; all reads/writes are local SQLite.
- **Zero behavior change:** instrumentation must not alter the result, ordering,
  or (meaningfully) the latency of the bounded calls it wraps. Best-effort writes.
- **No new model calls:** eval reuses existing integrity checks; M13 adds no
  LLM-as-judge call.
- **Deterministic analysis:** repo detection + cost estimation + teaching are
  pure/deterministic and unit-tested; any narrative phrasing follows the M12
  precedent (templated, parameterized — no SDK call required).
- **Beginner-first copy:** repo-observability teaching avoids undefined jargon and
  never surfaces raw errors/stack traces.
- **Privacy:** prompts/outputs captured in traces stay local; the trace model
  must allow storing call metadata without forcing full prompt/response capture
  when not wanted (a captured-content policy field).
- **Type safety:** failures are discriminated result values, consistent with the
  M11/M12 convention.

## Success Criteria

- After running any M7/M9/M10 bounded call, a trace row exists with model, token
  counts, an estimated cost, latency, and a typed outcome — verified by test.
- A failing bounded call (forced integrity rejection / missing key) produces a
  trace with the failure kind and an eval result with `passed: false` — verified
  by test.
- Instrumentation is proven **non-blocking**: with the observability write forced
  to throw, the underlying call still returns its normal result — verified by test.
- Importing an LLM-app repo yields a detected observability story naming the real
  SDK + call sites; a non-LLM repo yields the "no LLM app detected" state — both
  verified by tests with fixtures.
- Viewing traces/evals/analysis makes **zero** network calls and needs no API key
  — asserted by test or documented verification.
- All new deterministic modules ship with passing Vitest; CI green.

## Constraints & Assumptions

- Builds on **`llm-foundation`** (the shared SDK client the bounded calls use),
  **M7/M9/M10** (the bounded calls to instrument + their integrity checks),
  **M11** (snapshot read for repo detection), and the **M12** pattern
  (deterministic, parameterized teaching; typed data-access; per-feature page).
- Reuse before building: eval signal comes from existing integrity checks; repo
  reads go through the existing snapshot DAL.
- The cost table is an **estimate** (static, dated); exact billing is out of scope.
- Local-first and "no new external tool" are deliberate — **no Langfuse dependency
  in M13**. If a real Langfuse export is added later, it follows the official-docs
  install rule and a human-approved ADR (it changes the external-service posture).
- UI surface (new page vs. extending an existing one) is deferred to the epic.

## Out of Scope

- **Integrating Langfuse (or any hosted observability service).** M13 is
  Langfuse-*shaped* and export-*ready*, but ships no Langfuse dependency, no
  account, no network export.
- **LLM-as-judge / model-graded eval.** Eval reuses existing deterministic
  integrity checks; no new SDK call to score outputs.
- **Instrumenting the user's repo at runtime.** Part B *analyzes and teaches* the
  user's repo statically from the snapshot; it does not run or instrument their code.
- **Exact billing / invoicing.** Cost is a labelled estimate from a static table.
- **Distributed tracing / multi-service spans.** Single-process, single-call
  traces only.
- **Alerting, dashboards-as-a-service, retention policies.** A local view only.
- **Choosing the final UI layout** — owned by the epic (Page Spec if a new page).

## Dependencies

- **`llm-foundation`** — the shared Anthropic SDK client the wrapper hooks into.
- **M7 / M9 / M10** — the bounded SDK calls to instrument and their integrity
  checks (the eval signal source).
- **M11 — GitHub Integration** — snapshot read (`repo_files`) for Part B detection.
- **M12 — CCPM Integration** — the deterministic-teaching + typed-data-access +
  per-feature-page pattern to mirror.
- **packages/db (Drizzle)** — schema + migration for traces + eval results.
- External: **none new** (no Langfuse, no hosted service in M13).
