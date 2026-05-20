---
name: foundation
status: in-progress
created: 2026-05-20T17:45:53Z
updated: 2026-05-20T17:45:53Z
progress: 0%
prd: .claude/prds/foundation.md
github: (will be set on sync)
---

# Epic: foundation

## Overview

Stand up the AI-native development foundation for Industrial Coding Coach: a
verified shadcn/ui monorepo, Claude Code + CCPM setup, the workflow filesystem,
the foundation PRD/epic/issues, a CI + security baseline, repository governance,
and a tool radar. No product features — traceability and quality gates only.

## Architecture Decisions

- **Monorepo:** pnpm workspaces + Turborepo, scaffolded with the official
  shadcn CLI (`apps/web`, `packages/ui`, shared eslint/typescript configs).
- **Delivery workflow:** CCPM (`automazeio/ccpm`) as an Agent Skill at
  `.claude/skills/ccpm/`; copied (not symlinked) for Windows portability.
- **Workflow filesystem:** `docs/` created as an approved manual overlay;
  Copier template authoring deferred (ADR 0002).
- **Quality gate:** GitHub Actions CI + Gitleaks + CodeQL + Dependabot.
- See ADRs 0001–0003 in `docs/decisions/`.

## Technical Approach

### Frontend Components

None in this epic — the scaffold ships the default shadcn/ui app only. No
product UI is built during the foundation.

### Backend Services

None — no database, auth, or APIs in the foundation.

### Infrastructure

- GitHub Actions workflows: `ci.yml` (install/lint/build, test when present),
  `security.yml` (Gitleaks), `codeql.yml` (CodeQL analysis).
- `dependabot.yml` for npm + GitHub Actions update PRs.
- `.gitleaks.toml` secret-scanning config.
- Branch protection on `main` (configured or documented if admin-gated).

## Implementation Strategy

Foundation steps M0.1–M0.5 are infrastructure setup and were completed first so
later tasks have a working repo to build on. Remaining tasks (CI/security,
governance, tool radar, verification) build on that base. Tasks 001–005 are
recorded for traceability and are already complete; 006–009 are the open work.

## Task Breakdown Preview

- 001 — shadcn/ui monorepo scaffold *(closed)*
- 002 — Claude Code project setup *(closed)*
- 003 — CCPM install *(closed)*
- 004 — CLAUDE.md workflow memory *(closed)*
- 005 — Workflow filesystem (docs/ + .github/) *(closed)*
- 006 — CI + security baseline *(open)*
- 007 — GitHub engineering governance *(open)*
- 008 — Tool radar *(open)*
- 009 — Verify and commit foundation *(open)*

## Dependencies

- External: Node 22, pnpm, Turborepo, Next.js, shadcn/ui, `gh`, CCPM,
  `gh-sub-issue`.
- Internal: 006–008 depend on 001–005; 009 depends on 006–008.
- The Foundation PRD (`.claude/prds/foundation.md`) must be human-approved
  before issue sync / task execution.

## Success Criteria (Technical)

- `pnpm install`, `pnpm lint`, `pnpm build` pass at repo root.
- CCPM installed and usable (`status.sh` runs).
- CI/security workflow files exist and are syntactically valid.
- Governance configured or documented.
- Tool radar exists with per-tool status.
- No secrets committed; no product features implemented.

## Estimated Effort

~1 working day. Tasks 001–005 complete; 006–009 are small (XS–S each).

## Tasks Created

- [x] 001.md - shadcn/ui monorepo scaffold (parallel: false)
- [x] 002.md - Claude Code project setup (parallel: false)
- [x] 003.md - CCPM install (parallel: false)
- [x] 004.md - CLAUDE.md workflow memory (parallel: false)
- [x] 005.md - Workflow filesystem docs/ + .github/ (parallel: false)
- [ ] 006.md - CI + security baseline (parallel: true)
- [ ] 007.md - GitHub engineering governance (parallel: true)
- [ ] 008.md - Tool radar (parallel: true)
- [ ] 009.md - Verify and commit foundation (parallel: false)

Total tasks: 9
Parallel tasks: 3 (006, 007, 008)
Sequential tasks: 6
Estimated total effort: ~8 hours (001–005 already complete)
