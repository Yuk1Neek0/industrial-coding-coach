# CLAUDE.md

Guidance for Claude Code (and any AI agent) working in this repository.

## Project

**Industrial Coding Coach** — an open-source, local-first, web-based learning
coach. It takes a project a **job-seeking junior dev** built with heavy AI
assistance and coaches them to genuinely understand it — the stack, the
architecture, and how it maps onto a real professional development workflow — so
they can explain and defend it in interviews. It coaches *existing* repos; it
does not generate projects.

Authoritative product definition: `.claude/prds/product.md` (see also
`docs/current/product-overview.md`). This is an AI-native project: the workflow,
quality gates, and tooling are themselves part of what it demonstrates.

## Repository Shape

shadcn/ui Next.js monorepo (pnpm workspaces + Turborepo):

```
apps/web/                 # Next.js app
packages/ui/              # shared shadcn/ui component library
packages/eslint-config/   # shared ESLint config
packages/typescript-config/ # shared tsconfig
.claude/skills/ccpm/      # CCPM delivery workflow (installed skill)
.claude/prds/             # CCPM product requirement documents
.claude/epics/            # CCPM epics + tasks
docs/                     # workflow filesystem (specs, design, decisions, ...)
```

Common commands (run from repo root):

```bash
pnpm install      # install workspace deps
pnpm lint         # turbo lint across packages
pnpm build        # turbo build
pnpm typecheck    # turbo typecheck
pnpm dev          # run the web app
```

## Core Workflow — CCPM is the Delivery Spine

CCPM (installed at `.claude/skills/ccpm/`) is the **core delivery workflow**.
Do not invent a custom "CCPM-like" workflow. The installed skill and its
`references/*.md` files are the source of truth for CCPM operations.

Every milestone follows:

```
Milestone Goal
→ CCPM Plan: PRD / Spec
→ CCPM Epic: technical planning
→ CCPM Structure: task decomposition
→ CCPM Sync: GitHub Issues
→ one GitHub Issue / CCPM task at a time
→ UI issue? Page Spec → v0 prompt → v0 draft → integration
→ Claude Code implementation
→ AI self-review → local verification
→ Pull Request → GitHub CI / security checks
→ human review → merge / cleanup / archive
→ retrospective
```

Before any CCPM operation, read `.claude/skills/ccpm/SKILL.md` and
`.claude/skills/ccpm/references/conventions.md`, then the phase-specific
reference file (`plan.md`, `structure.md`, `sync.md`, `execute.md`, `track.md`).

Use CCPM scripts for deterministic status (`status.sh`, `standup.sh`, `next.sh`,
`blocked.sh`, `validate.sh`, ...). Use LLM reasoning for planning, architecture,
implementation, and review.

## Hard Rules

- **No product feature** may be implemented without a PRD/spec and a CCPM
  task / GitHub Issue. (Foundation/setup work is exempt only during Milestone 0.)
- **Maintenance chores are exempt from CCPM planning.** Dependency upgrades
  (including Dependabot PRs), toolchain/config fixes, lockfile refreshes, and
  CI/build tweaks are *not* product features — they do **not** require a PRD,
  epic, or CCPM task. They still follow the standard delivery discipline: a
  dedicated `chore/<name>` branch, the bounded-work statement (issue, files,
  plan, verification, risks) before and after editing, local verification, AI
  self-review, a PR, passing CI, and human review/merge. If a "chore" changes
  product behavior or scope, it is a feature — route it through CCPM instead.
- **One bounded issue at a time** within a stream. State the issue, files to
  change, plan, verification commands, and risks before editing. After editing,
  summarize changed files, the acceptance-criteria checklist, verification
  results, and risks. Then stop for human review.
- **Parallel work** follows ADR 0008: epics run in parallel via git worktrees
  (one `epic/<name>` branch per epic, merged to `main` via PR — from M3 onward);
  within an epic, independent non-conflicting tasks may run as background
  sub-agents. Dependency-chained tasks stay sequential.
- **Tool installation follows official docs / official repo README** — never
  install or upgrade a major tool from memory. Record the source in a setup
  note or ADR. Ask for human approval if a tool changes architecture,
  permissions, or workflow.
- **GitHub CI is the quality gate.** A change is merge-ready only when local
  verification passed (or failures are documented), AI self-review is done, a
  PR exists, CI/security checks pass, and a human approves.
- **Copier** is the intended workflow-filesystem initializer. The `docs/`
  structure currently exists as a manually created overlay (see
  `docs/decisions/0002-workflow-filesystem.md`); do not invent an alternative
  structure.
- **v0** is used only for UI/interface issues, only after a Page Spec exists
  under `docs/design/`. Never use v0 for foundation, CI, backend logic,
  schemas, architecture, or product-scope decisions.
- **Security:** never commit secrets. `.env` is git-ignored; `.env.example`
  is committed. Review hooks before committing them. `.mcp.json` holds no
  secrets.
- **Human review** is the final approval authority for scope, architecture,
  tools, PRs, and milestone completion.

## Source of Truth

- Delivery state & tasks → CCPM (`.claude/prds/`, `.claude/epics/`) + GitHub Issues
- Quality gates → GitHub Actions CI
- Decisions → `docs/decisions/` (ADRs)
- Specs → `docs/specs/`; UI page specs → `docs/design/`
- Milestone plans → the two `updated_*plan.md` files at repo root and `docs/milestones/`
