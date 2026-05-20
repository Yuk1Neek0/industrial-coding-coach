# ADR 0003 — CCPM Installation

- **Status:** Accepted
- **Date:** 2026-05-20

## Context

CCPM is the core delivery workflow. It must be installed via its official
method (per the project's official-installation rule).

## Decision

Install CCPM from the official repository **automazeio/ccpm**.

- **Source:** <https://github.com/automazeio/ccpm> (`README.md`, `skill/ccpm/`).
- CCPM is distributed as an Agent Skill. The official method clones the repo
  and symlinks `skill/ccpm` to `.claude/skills/ccpm`.
- **Deviation:** instead of a symlink, the `skill/ccpm` directory was **copied**
  into `.claude/skills/ccpm`. Rationale: symlinks are not portable on Windows
  and do not commit cleanly; copying makes CCPM self-contained and
  version-controlled in this repo.
- Ran the official `references/scripts/init.sh`, which created `.claude/prds/`,
  `.claude/epics/`, `.claude/rules/`, `.claude/scripts/pm/`, installed the
  `gh-sub-issue` gh extension, and created `epic` / `task` GitHub labels.

The installed layout (`SKILL.md` + `references/{conventions,plan,structure,sync,execute,track}.md`
+ `references/scripts/`) matches the structure the milestone plan expects.

## Consequences

- CCPM operations follow the installed skill and its reference files; no custom
  CCPM-like workflow is invented.
- CCPM is pinned to the snapshot copied at install time. Upgrades are a
  deliberate action: re-copy from upstream and record it in a new ADR.
- The `gh-sub-issue` extension is required for epic→task sub-issue sync.
