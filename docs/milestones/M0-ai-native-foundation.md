# M0 — AI-Native Development Pipeline Foundation

**State:** Foundation built, synced & pushed — pending human review · **Date:** 2026-05-20

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
| M0.7 | Epic + tasks via CCPM | Done — epic #5, tasks #6–#14 synced to GitHub |
| M0.8 | CI + security baseline | Done — CI ✅; see open CI findings below |
| M0.9 | GitHub engineering governance | Documented — ADR 0004; protection blocked by plan tier |
| M0.10 | Tool radar | Done — `docs/tool-radar.md` |
| M0.11 | Verify and commit foundation | Done — pushed to `origin/main` |

## Gated actions — all approved and executed (2026-05-20)

1. **Foundation PRD approved** — `status: active`.
2. **CCPM Sync done** — epic #5, tasks #6–#14 created and sub-issue-linked;
   `github-mapping.md` written. Issues are **open** pending human review.
3. **Branch protection — not pursued.** Private free-plan repo blocks both
   classic protection and rulesets (HTTP 403). Maintainer chose not to make the
   repo public or upgrade to Pro. `main` relies on workflow discipline by
   convention — see ADR 0004.
4. **Pushed** — commits `fede410` + `f3f40fb` on `origin/main`.
5. **Security features enabled** — Dependabot alerts, automated security fixes,
   secret scanning + push protection.

## CI findings

- **Gitleaks — fixed.** `gitleaks/gitleaks-action@v2` crashed on Dependabot PRs
  (HTTP 403 calling `/pulls/{n}/commits` with a read-only token). `security.yml`
  now runs the official gitleaks binary directly — no API calls, works for all
  event types.
- **CodeQL — known limitation, left as-is.** `codeql.yml` runs but the upload
  step fails: *"Code scanning is not enabled for this repository"* (needs a
  public repo or Advanced Security). The workflow is correct and will pass once
  code scanning is available. Not pursued for the same reason as branch
  protection.

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
