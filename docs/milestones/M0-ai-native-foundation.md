# M0 — AI-Native Development Pipeline Foundation

**State:** Foundation built — pending human review · **Date:** 2026-05-20

Goal: establish the clean, traceable, AI-native development foundation —
scaffold, Claude Code setup, CCPM workflow, workflow filesystem, GitHub issue
workflow, CI/security baseline, governance. **No product features in M0.**

## Sub-task status

| Step | Description | Status |
|---|---|---|
| M0.1 | shadcn/ui Next.js monorepo scaffold | Done — install/lint/typecheck/build verified |
| M0.2 | Claude Code project setup (`.claude/`, `.mcp.json`) | Done |
| M0.3 | CCPM install (automazeio/ccpm) | Done — see ADR 0003 |
| M0.4 | CLAUDE.md workflow memory | Done |
| M0.5 | Workflow filesystem (`docs/`, `.github/`) | Done — Copier deferred, ADR 0002 |
| M0.6 | Foundation PRD via CCPM | Done — `.claude/prds/foundation.md` |
| M0.7 | Epic + tasks via CCPM | Done locally — epic + 9 tasks; **GitHub sync gated** |
| M0.8 | CI + security baseline | Done — ci/security/codeql/dependabot/gitleaks |
| M0.9 | GitHub engineering governance | Documented — ADR 0004; **application gated** |
| M0.10 | Tool radar | Done — `docs/tool-radar.md` |
| M0.11 | Verify and commit foundation | Verified; committed locally — **push gated** |

## Gated actions (require human review before execution)

1. **Approve the Foundation PRD** (`.claude/prds/foundation.md`). The plan
   requires PRD approval before task execution / issue sync.
2. **CCPM Sync** — push the foundation epic + 9 tasks to GitHub Issues
   (`gh issue create`). Outward-facing; deferred per the PRD-approval gate.
3. **Apply branch protection** on `main` (ADR 0004) — possible only after CI
   has run once on GitHub; requires repo admin.
4. **Push** the foundation commit to `origin/main`.
5. Enable repo security features (Dependabot alerts, secret scanning / push
   protection) in GitHub settings where the account allows.

## Definition of Done

- [x] shadcn monorepo clean and verified
- [x] Claude Code project setup installed
- [x] CCPM installed and usable
- [x] Workflow filesystem exists (Copier overlay — ADR 0002)
- [x] Foundation PRD created through CCPM
- [x] Foundation PRD converted to epic + tasks (issue sync gated)
- [x] CI/security baseline exists
- [x] GitHub governance documented (application gated — ADR 0004)
- [x] Tool radar exists
- [x] No secrets committed
- [x] No product features implemented
- [ ] Human review complete *(this is the gate — see above)*
