# ADR 0001 — Development Workflow

- **Status:** Accepted
- **Date:** 2026-05-20

## Context

The project needs a consistent, traceable, AI-native delivery process so that
AI agents and humans build the same way every milestone, with quality gates
and human review.

## Decision

Adopt a CCPM-centered production pipeline:

| Layer | Tool | Responsibility |
|---|---|---|
| Delivery workflow | CCPM | PRD → Epic → Tasks → GitHub Issues, tracking, close/merge/archive |
| Implementation agent | Claude Code | Executes one bounded GitHub Issue / CCPM task at a time |
| Quality gate | GitHub Actions CI | install, lint, build, tests, security checks |
| Security baseline | Gitleaks, CodeQL, Dependabot | secrets, static analysis, dependency risk |
| Workflow filesystem | Copier (intended) | initializes `docs/` and `.github/` templates |
| UI draft generation | v0 | UI/interface drafts, only after a Page Spec |
| Final approval | Human review | scope, architecture, tools, PRs, milestones |

Hard rules:

- No product feature without a PRD/spec and a CCPM task / GitHub Issue.
- One bounded issue at a time; stop for human review.
- Tools are installed via official methods only, recorded in an ADR/setup note.
- CI must pass before merge; human review is the final gate.
- v0 only for UI issues after a Page Spec; never for foundation/logic/schema.

## Consequences

- All work is traceable from milestone → PRD → epic → issue → PR.
- Claude Code must not invent a custom "CCPM-like" workflow; the installed
  CCPM skill is the source of truth.
- Extra process overhead for small changes, accepted in exchange for
  traceability and reviewability.
