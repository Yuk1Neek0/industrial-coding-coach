# Tool Radar

Classifies tools so powerful options can be explored without polluting the
adopted main path. Reviewed at each milestone.

**Rings:** Adopt (in the main path) · Trial (evaluate on a branch/spike) ·
Assess (research only) · Hold (do not adopt now).

## Adopt — main path

| Tool | Why | Risk note |
|---|---|---|
| shadcn/ui monorepo | Official, well-documented Next.js + Turborepo base; owns its component code | shadcn CLI churn; pin versions, re-run init deliberately |
| Claude Code | Primary AI implementation agent | Must work within bounded issues; enforce via `CLAUDE.md` |
| CCPM (automazeio/ccpm) | Core delivery workflow: PRD → epic → issues → execution | Pinned to install snapshot; upgrades are manual (ADR 0003) |
| GitHub Issues | Execution source of truth | Keep CCPM ↔ Issues in sync; avoid drift |
| GitHub Actions | Quality-gate CI runner | Action version drift; covered by Dependabot |
| Gitleaks | Secret scanning in CI | False positives; tuned via `.gitleaks.toml` |
| Dependabot | Dependency + Actions update PRs | PR noise; grouped minor/patch updates |
| Copier | Intended workflow-filesystem initializer | No template yet — `docs/` is a manual overlay (ADR 0002) |
| Anthropic SDK | Default for all core LLM calls (M4/M5/M8) — prompt caching, tool use, structured outputs | Model/version drift; pin model IDs, follow official migration notes (ADR 0005) |
| Claude Design | UI-generation tool — links the repo, designs on a canvas, exports to Claude Code | Research preview, may change; UI still requires a Page Spec first (ADR 0007) |

## Trial — evaluate before adopting

| Tool | Candidate use | Note |
|---|---|---|
| BMAD | Agent-driven planning method | Compare against CCPM; do not run two delivery workflows |
| GitHub Spec Kit | Spec-driven development scaffolding | May overlap with CCPM Plan phase |
| OpenHands | Autonomous coding agent | Sandbox/permission review required before use |
| Langfuse | LLM observability + evals | Relevant once the product makes LLM calls; evaluate at M13 |
| LangChain.js + LangGraph | Repo-ingestion RAG + multi-step agent — **scoped to M6 (Project Logic Mapper) only** | Heavy abstraction; do not let it spread to M4/M5/M8 or the whole app (ADR 0005). Installed in `packages/ai` at M6 — see `docs/setup/langchain.md` |
| LangSmith | LLM tracing/observability — native LangChain integration | Evaluate against Langfuse at M13; avoid vendor lock-in |
| Storybook | Component workshop / visual review | Adopt with the first real UI milestone |
| Playwright | E2E testing | Adopt when `test:e2e` is introduced; CI is pre-wired |

## Assess — research only

| Tool | Reason to watch |
|---|---|
| Backstage | Golden-path / software-template source (M14) |
| Port | Internal developer portal alternative |
| Red Hat Developer Hub / Roadie templates | Software-template inspiration for the Template Registry |
| Pulumi templates | Infrastructure-as-code template patterns |
| Contract-first (OpenAPI) templates | Relevant to the Contract-first Golden Path |

## Hold

| Tool | Reason |
|---|---|
| Any second delivery workflow alongside CCPM | One delivery spine only — avoid process conflict |
| Custom CCPM-like scripts | The installed CCPM skill is the source of truth |
| CodeQL | Code scanning needs a public repo or Advanced Security — unavailable on the private free plan; dropped (ADR 0004). Re-add from the official starter workflow if the repo goes public. |
| v0 | Replaced by Claude Design as the UI-generation tool (ADR 0007). |

## Review log

| Date | Change |
|---|---|
| 2026-05-20 | Initial radar created during Milestone 0. |
| 2026-05-20 | Added Anthropic SDK (Adopt); LangChain.js + LangGraph and LangSmith (Trial) — see ADR 0005. |
| 2026-05-20 | Dropped CodeQL (Adopt → Hold) — unavailable on the private free plan; see ADR 0004. |
| 2026-05-20 | Adopted Claude Design as the UI-generation tool; v0 retired (Trial → Hold) — see ADR 0007. |
| 2026-05-22 | LangChain.js + LangGraph installed in `packages/ai`, scoped to M6 (still Trial) — see ADR 0005 and `docs/setup/langchain.md`. |
