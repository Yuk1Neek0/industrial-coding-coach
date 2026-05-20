---
name: foundation
description: AI-native development pipeline foundation — scaffold, CCPM, workflow filesystem, CI/security, governance
status: completed
created: 2026-05-20T17:45:53Z
---

# PRD: foundation

## Executive Summary

Establish the AI-native development foundation for the Industrial Coding Coach
project: a clean shadcn/ui Next.js monorepo, Claude Code project setup, the CCPM
delivery workflow, a Copier-style workflow filesystem, the GitHub Issues
workflow, a GitHub Actions CI and security baseline, repository governance, and
a tool radar. This PRD covers **Milestone 0 only**. It deliberately implements
**no product features** — its sole purpose is to make all later product work
traceable, reviewable, and quality-gated.

## Problem Statement

AI-assisted ("vibe-coded") projects often grow without a delivery process: no
spec, no traceable tasks, no quality gates, and no record of why decisions were
made. The result is code nobody fully understands or can safely review.

Before building the product itself, the project needs a foundation where:

- every change traces back to a spec and a task/issue;
- AI agents work within bounded, reviewable units;
- quality is gated by automated CI and security checks;
- humans approve scope, architecture, and merges;
- tool choices are deliberate and recorded.

Without this foundation, later milestones would repeat the exact failure mode
the product is meant to fix.

## User Stories

### US-1 — Maintainer wants a working, verifiable scaffold
As the project maintainer, I want a monorepo that installs, lints, and builds
cleanly, so that all later work starts from a known-good baseline.
**Acceptance:** `pnpm install`, `pnpm lint`, `pnpm build` all succeed at the
repo root; the repo root is the monorepo root (no nested-project problem).

### US-2 — AI agent needs an enforced workflow
As an AI implementation agent, I want local guidance (`CLAUDE.md`) and an
installed CCPM workflow, so that I follow the project process without repeated
human reminders.
**Acceptance:** `CLAUDE.md` encodes the workflow rules; CCPM is installed at
`.claude/skills/ccpm/` and its `SKILL.md` and reference files are readable;
the agent can explain the five CCPM phases from local files.

### US-3 — Reviewer needs traceability
As a human reviewer, I want every unit of work to map to a CCPM task / GitHub
Issue with acceptance criteria, so that I can review bounded, well-scoped
changes.
**Acceptance:** the foundation work itself is captured as a CCPM epic with
tasks; tasks are synced to GitHub Issues (or sync deferral is documented).

### US-4 — Maintainer needs automated quality gates
As the maintainer, I want CI and security checks to run on PRs and pushes to
`main`, so that broken or insecure changes are caught before merge.
**Acceptance:** CI runs install/lint/build; Gitleaks, CodeQL, and Dependabot
are configured; `.env` is git-ignored and `.env.example` is committed.

### US-5 — Team needs a deliberate tool strategy
As the team, I want a tool radar that classifies tools as Adopt/Trial/Assess/
Hold, so that powerful tools can be explored without polluting the main path.
**Acceptance:** a tool radar document exists with a status and rationale per
tool.

## Functional Requirements

- **FR-1 Scaffold.** A shadcn/ui Next.js monorepo (`apps/web`, `packages/ui`,
  shared eslint/typescript configs) using pnpm workspaces + Turborepo, created
  via the official shadcn CLI.
- **FR-2 Claude Code setup.** `.claude/settings.json`, `.claude/commands/`,
  `.claude/agents/`, and `.mcp.json` exist; `.mcp.json` contains no secrets.
- **FR-3 CCPM workflow.** CCPM installed from the official `automazeio/ccpm`
  repo at `.claude/skills/ccpm/`; `.claude/prds/` and `.claude/epics/` exist;
  `gh-sub-issue` extension and base labels installed.
- **FR-4 Workflow memory.** `CLAUDE.md` encodes: CCPM as core workflow, one
  issue at a time, no product features in M0, CI as quality gate, Copier as
  filesystem initializer, v0 only for UI after page specs, official-install
  rule, security rules, source-of-truth rules.
- **FR-5 Workflow filesystem.** `docs/` (current, milestones, specs, design,
  decisions, testing, review, retrospectives, archive) plus
  `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`, and
  `.env.example`.
- **FR-6 Foundation PRD & epic.** This PRD, parsed into a CCPM epic and
  decomposed into tasks synced to GitHub Issues.
- **FR-7 CI & security baseline.** `.github/workflows/ci.yml`,
  `security.yml`, `codeql.yml`, `.github/dependabot.yml`, `.gitleaks.toml`,
  derived from official/mature templates and customized to the monorepo.
- **FR-8 Governance.** Branch protection / required checks / no force-push to
  `main` configured or documented.
- **FR-9 Tool radar.** A document classifying adopted/trial/assess/hold tools
  with rationale and risk notes.

## Non-Functional Requirements

- **Traceability:** every later change maps milestone → PRD → epic → issue → PR.
- **Reproducibility:** the foundation is reproducible from official tool
  installation methods; tool sources are recorded in ADRs.
- **Security:** no secrets in the repository; `.env` ignored; secret scanning,
  static analysis, and dependency alerts enabled.
- **Reviewability:** work arrives in bounded units small enough for one agent
  pass and one human review.
- **Portability:** the setup works on the maintainer's Windows environment
  (Node 22, pnpm, Python 3.13, `gh`).

## Success Criteria

- `pnpm install`, `pnpm lint`, `pnpm build` succeed at the repo root.
- CCPM is installed and usable; `status.sh` runs and the five phases are
  explainable from local reference files.
- `CLAUDE.md` and the `docs/` workflow filesystem exist and are documented.
- A Foundation epic exists, decomposed into ≤10 tasks, synced to GitHub Issues.
- CI/security workflow files exist and are valid.
- Governance is configured or explicitly documented.
- A tool radar exists with a status per tool.
- Zero secrets committed; zero product features implemented.
- Human review approves the foundation.

## Constraints & Assumptions

- **Constraint:** all tools installed via official methods only; sources
  recorded in ADRs (see `docs/decisions/`).
- **Constraint:** no product UI pages, recommendation logic, template registry,
  LLM features, database, auth, or user accounts in M0.
- **Assumption:** GitHub repo `Yuk1Neek0/industrial-coding-coach` exists and
  `gh` is authenticated.
- **Assumption:** Copier is the intended filesystem initializer, but no
  suitable template exists yet; the `docs/` structure was created as an
  approved manual overlay (ADR 0002) and authoring a Copier template is a
  tracked follow-up.
- **Assumption:** branch protection requires repo admin rights; if unavailable
  it is documented rather than enforced.

## Out of Scope

- Any product feature: Golden Path catalog, Template Registry, recommendation
  engine, stack explainer, project mapper, learning workspace, etc.
- Database, authentication, user accounts, LLM API integration.
- UI pages and v0 usage (v0 begins only in UI milestones after page specs).
- Authoring the Copier foundation template (tracked follow-up, not M0 blocking).
- End-to-end / unit test suites (CI is prepared to run them once they exist).

## Dependencies

- **External tools:** Node.js 22, pnpm, Turborepo, Next.js, shadcn/ui, Python
  3.13, GitHub CLI (`gh`), CCPM (`automazeio/ccpm`), `gh-sub-issue` extension.
- **Services:** GitHub repository, GitHub Actions, GitHub security features
  (CodeQL, Dependabot, secret alerts).
- **Planned (not blocking M0):** Copier, v0, Gitleaks Action.
- **Internal:** ADRs 0001–0003 in `docs/decisions/`; milestone plans at repo
  root and `docs/milestones/M0-ai-native-foundation.md`.
