# ADR 0005 — LLM Integration Architecture & LangChain Scope

- **Status:** Accepted
- **Date:** 2026-05-20

## Context

LLM-backed features begin at Milestone 4 (recommendation explanations) and
continue through M5 (stack explainer), M6 (project logic mapper), and M8 (diff
review). An architecture decision is needed now, before M4, for how the product
calls language models.

A specific question was raised: should **LangChain** be introduced? The stated
driver is **résumé / portfolio value** — this product is itself framed around
job-search advantage, so demonstrating a recognized AI-engineering framework has
real value.

This must be weighed against the product's core thesis: *help users understand,
review, and explain code — no opaque AI magic.* Routing the whole application
through a heavy abstraction layer would contradict that thesis and make the
codebase harder to review, which is exactly what M6/M8 exist to teach.

Per ADR 0001 and the milestone plan's "Architecture / tool adoption" rule, a
tool-adoption decision is recorded as an ADR with human approval before any
bounded implementation issue.

## Decision

Use each tool where it genuinely fits — not all-or-nothing.

1. **Core LLM features → Anthropic SDK directly.** M4, M5, and M8 are bounded
   prompt → structured-output calls. They use the Anthropic SDK directly, with
   prompt caching, tool use, and structured outputs. This is the cleanest,
   most reviewable, current-best-practice choice and stays on-thesis.

2. **LangChain.js + LangGraph → one deliberate showcase: M6 (Project Logic
   Mapper).** M6 ingests a repository and produces architecture maps, data-flow
   diagrams, and debug paths — a genuine multi-step *agentic + retrieval* task,
   which is LangChain/LangGraph's documented sweet spot (pre-built agent
   architecture; LangGraph for deterministic workflows; RAG document loaders,
   splitters, and retrievers). LangChain is **confined to the M6 pipeline**.

3. **Observability (M13) → LangSmith and/or Langfuse**, tracing the M6 pipeline.
   LangChain integrates natively with LangSmith; Langfuse also works. Both are
   evaluated at M13.

LangChain is **not** used for M4/M5/M8 or as a whole-app abstraction layer.

## Rationale

- The core features are bounded prompt→output calls; a framework adds
  dependency weight, frequent breaking changes, and indirection that obscures
  prompt/flow logic — the opposite of the product's reviewability goal.
- M6 is a real multi-step agent + RAG problem where LangChain/LangGraph add
  genuine value rather than ceremony.
- On résumé value: a **bounded, real** use is a stronger portfolio signal than
  a token whole-app integration. Interviewers probe depth — "I used LangGraph
  for the codebase-understanding agent and the Anthropic SDK directly for the
  bounded structured-output features, because X" demonstrates **engineering
  judgment**, the senior signal. It also yields defensible keyword density:
  LangChain, LangGraph, RAG, agents, Anthropic SDK, prompt caching, LLM
  observability.

## Consequences

- M4 starts on the Anthropic SDK; the M4 CCPM PRD cites this ADR.
- M6 introduces LangChain.js + LangGraph as a bounded task, with its own
  official-docs check at that time (per the official-installation rule).
- The tool radar records Anthropic SDK (Adopt) and LangChain.js / LangGraph +
  LangSmith (Trial, scoped to M6 / M13).
- If a future need appears for multi-provider model swapping or broader
  retrieval, this ADR is revisited rather than silently widening LangChain's
  scope.
- Supersedes nothing; complements ADR 0001 (tool-adoption rule).
