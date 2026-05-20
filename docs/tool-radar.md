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
| CodeQL | Static security analysis | Build/scan time cost; weekly schedule + PR runs |
| Dependabot | Dependency + Actions update PRs | PR noise; grouped minor/patch updates |
| Copier | Intended workflow-filesystem initializer | No template yet — `docs/` is a manual overlay (ADR 0002) |

## Trial — evaluate before adopting

| Tool | Candidate use | Note |
|---|---|---|
| v0 | UI/interface drafts after page specs | Only after a Page Spec; never for logic/architecture |
| BMAD | Agent-driven planning method | Compare against CCPM; do not run two delivery workflows |
| GitHub Spec Kit | Spec-driven development scaffolding | May overlap with CCPM Plan phase |
| OpenHands | Autonomous coding agent | Sandbox/permission review required before use |
| Langfuse | LLM observability + evals | Relevant once the product makes LLM calls (M13) |
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

## Review log

| Date | Change |
|---|---|
| 2026-05-20 | Initial radar created during Milestone 0. |
