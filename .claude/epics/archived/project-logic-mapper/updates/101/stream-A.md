---
issue: 101
stream: install
started: 2026-05-22T15:10:00Z
status: completed
---

# Issue #101 — Install LangChain.js + LangGraph (Stream A: install)

## Scope
- `packages/ai/package.json` + workspace lockfile
- `docs/setup/langchain.md` (new setup note)
- `docs/tool-radar.md` (move LangChain entry to its proper documented state)

## Decisions
- M6 pipeline deps are scoped to `@workspace/ai` (`packages/ai`). Rationale:
  `packages/ai` is already the shared LLM foundation operationalizing ADR 0005;
  it hosts the LLM client. The M6 LangGraph pipeline is LLM-orchestration code,
  so it belongs alongside the existing LLM foundation rather than in a new
  package. `packages/db` already handles repo ingestion (github/stack) and the
  pipeline will consume that as a workspace dep — no new package needed.
- NOT installed at workspace root (per task rule + ADR 0005 confinement).

## Official-docs sources
- LangChain.js install: https://docs.langchain.com/oss/javascript/langchain/install
- LangChain.js overview: https://docs.langchain.com/oss/javascript/langchain/overview
- LangGraph.js: https://docs.langchain.com/oss/javascript/langgraph/overview
- Official install command (LangChain): `npm install langchain @langchain/core` (requires Node.js 20+)
- Official install command (LangGraph): `npm install @langchain/core @langchain/langgraph`

## Packages installed (latest, npm registry, 2026-05-22)
- `@langchain/core@^1.1.48`
- `langchain@^1.4.2`
- `@langchain/langgraph@^1.3.2`
- `@langchain/anthropic@^1.4.0`
- `zod@^3.25.32` — required peer dependency of `@langchain/langgraph`

## Progress
- [x] Read task, ADR 0005, ADR 0001, tool radar, anthropic-sdk setup note
- [x] Confirmed official package names/versions via official docs + npm registry
- [x] Installed deps into `packages/ai` (langchain 1.4.2, @langchain/core 1.1.48,
      @langchain/langgraph 1.3.2, @langchain/anthropic 1.4.0, zod 4.4.3)
- [x] Wrote `docs/setup/langchain.md`
- [x] Updated `docs/tool-radar.md` (Trial entry note + review log)
- [x] Verified `pnpm install` / `pnpm typecheck` / `pnpm build` — all pass

## Verification results
- `pnpm install` — Done, lockfile up to date
- `pnpm typecheck` — 4 successful, 4 total
- `pnpm build` — 1 successful, 1 total (web app builds)

## Notes
- ADR 0001 referenced in the task is titled `0001-tooling-baseline.md`; the
  worktree's actual file is `docs/decisions/0001-*.md` — only 0005 and 0007 ADRs
  reference the radar. ADR 0005 is the governing decision for this task.
- The tool-radar already carried a LangChain.js + LangGraph Trial row scoped to
  M6 (added 2026-05-20 per ADR 0005). This task augmented it with the install
  location + setup-note link and added a review-log line, rather than creating a
  duplicate row.
- No files outside scope were touched.
