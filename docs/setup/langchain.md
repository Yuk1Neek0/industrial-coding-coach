# Setup Note — LangChain.js + LangGraph

Records the official source and installed versions of LangChain.js and
LangGraph, the multi-step agent + RAG framework for the **M6 Project Logic
Mapper** pipeline. The decision to adopt them — and the strict scope — is
**ADR 0005**; this note records the install facts (per the CLAUDE.md rule:
tool installs follow official docs and the source is recorded).

## Scope

Per **ADR 0005**, LangChain.js / LangGraph are **confined to the M6 pipeline**.
They are *not* used for M4/M5/M8 (those call the Anthropic SDK directly) and
*not* used as a whole-app abstraction layer. They are recorded on the tool
radar as **Trial**, scoped to M6.

## Tools

- **Packages:**
  - `langchain` — main LangChain.js framework package
  - `@langchain/core` — core utilities and interfaces (shared base)
  - `@langchain/langgraph` — LangGraph.js, deterministic multi-step agent graphs
  - `@langchain/anthropic` — Anthropic (Claude) chat-model integration
  - `zod` — required peer dependency of `@langchain/langgraph` (schema/state typing)
- **Official docs:**
  - LangChain.js install: <https://docs.langchain.com/oss/javascript/langchain/install>
  - LangChain.js overview: <https://docs.langchain.com/oss/javascript/langchain/overview>
  - LangGraph.js overview: <https://docs.langchain.com/oss/javascript/langgraph/overview>
- **Repositories:**
  - <https://github.com/langchain-ai/langchainjs>
  - <https://github.com/langchain-ai/langgraphjs>
- **License:** MIT
- **Installed in:** `packages/ai` (`@workspace/ai` — the shared LLM foundation;
  the M6 pipeline is LLM-orchestration code and consumes repo-ingestion data
  from `@workspace/db` as a workspace dependency). Deliberately **not** installed
  at the workspace root, to keep the M6 scope contained per ADR 0005.

## Install method (official)

Per the official docs, the recommended install commands are:

```bash
# LangChain.js (requires Node.js 20+)
npm install langchain @langchain/core

# LangGraph.js
npm install @langchain/core @langchain/langgraph

# Anthropic (Claude) integration package
npm install @langchain/anthropic
```

In this pnpm workspace they were installed into the `@workspace/ai` package:

```bash
pnpm --filter @workspace/ai add @langchain/core @langchain/langgraph @langchain/anthropic langchain zod
```

`zod` is added explicitly because it is a required peer dependency of
`@langchain/langgraph` (used for graph state schemas).

## Installed versions

Recorded in `packages/ai/package.json`; pnpm pins the exact resolved versions
in the workspace lockfile. Dependabot surfaces future upgrades.

| Package | Version range | Resolved (2026-05-22) |
|---|---|---|
| `langchain` | `^1.4.2` | 1.4.2 |
| `@langchain/core` | `^1.1.48` | 1.1.48 |
| `@langchain/langgraph` | `^1.3.2` | 1.3.2 |
| `@langchain/anthropic` | `^1.4.0` | 1.4.0 |
| `zod` | `^4.4.3` | 4.4.3 |

## Requirements

- Node.js 20 LTS or later (the monorepo already requires `node >= 20`).
- `@langchain/langgraph` peer-depends on `@langchain/core` and `zod`
  (`^3.25.32 || ^4.2.0`) — `zod@4.4.3` satisfies that range.
- `@langchain/anthropic` peer-depends on `@langchain/core` — the installed
  `1.1.48` satisfies its `^1.1.47` requirement.

## Usage in this project

- Used **server-side only** — the M6 pipeline runs on the server, never bundled
  into client code (same constraint as the Anthropic SDK).
- The Claude API key is reached via `@langchain/anthropic`'s chat model, which
  reads `ANTHROPIC_API_KEY` — the same environment variable and convention used
  by `packages/ai`'s existing `getAnthropicApiKey` config accessor.
- This task installs the dependency surface only. The actual M6 pipeline
  (graph definition, document loaders, retrievers, agent steps) is delivered by
  the later `project-logic-mapper` epic tasks.

## References

- ADR 0005 — LLM Integration Architecture & LangChain Scope
- `docs/tool-radar.md` — LangChain.js / LangGraph are in the Trial ring (M6)
- `docs/setup/anthropic-sdk.md` — the directly-used Anthropic SDK (Adopt)
