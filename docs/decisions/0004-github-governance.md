# ADR 0004 — GitHub Engineering Governance

- **Status:** Accepted — **branch protection blocked by plan tier** (see Application Result)
- **Date:** 2026-05-20

## Context

The `main` branch must be protected and work must be reviewable before any
product feature development begins. Applying branch protection is an
outward-facing repository-settings change, and **required status checks can
only reference check runs that GitHub has already observed** — which cannot
happen until the CI workflows (ADR none; task 006) have run on a pushed branch.

## Decision

Adopt the following governance ruleset for `main`. It is documented here now
and applied once the CI workflows have run at least once on GitHub.

### Branch protection for `main`

- Require a pull request before merging.
- Require at least 1 approving review.
- Require status checks to pass before merging:
  - `Lint, typecheck & build` (CI workflow, job `verify`)
  - `Gitleaks secret scan` (Security workflow)
  - `CodeQL analyze` (CodeQL workflow)
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Disallow force pushes to `main`.
- Disallow branch deletion of `main`.

### Repository settings

- Issues: enabled.
- Dependabot alerts + security updates: enabled.
- Secret scanning + push protection: enabled where the plan/account allows.
- CodeQL (code scanning): enabled via the committed workflow.

## How to apply (gated action)

After CI has run once on GitHub, apply via `gh` (requires repo admin):

```bash
gh api -X PUT repos/Yuk1Neek0/industrial-coding-coach/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Lint, typecheck & build", "Gitleaks secret scan", "CodeQL analyze"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

(Or use a Repository Ruleset in the GitHub UI: Settings → Rules.)

## Application Result (2026-05-20)

Branch protection was approved and **attempted**, but could not be applied:

- **Classic branch protection** (`PUT /branches/main/protection`) → HTTP 403:
  *"Upgrade to GitHub Pro or make this repository public to enable this
  feature."*
- **Repository ruleset** (`POST /rulesets`) → HTTP 403, same reason.

This repository is **private on the free plan**, where neither classic branch
protection nor rulesets are available. The intended ruleset above is therefore
documented but **not enforced**. The plan permits governance to be *configured
or documented* — it is documented here.

**To enable it**, choose one:
1. Make the repository public, or
2. Upgrade the account to GitHub Pro,

then apply the ruleset (`gh api -X POST repos/<repo>/rulesets ...`). For a solo
maintainer, use `required_approving_review_count: 0` so PRs + CI are required
without a self-blocking approval gate.

What **was** enabled successfully:
- Dependabot alerts ✅
- Dependabot automated security fixes ✅
- Secret scanning + push protection ✅
- Issues: enabled (default).
- CodeQL workflow committed, but code scanning upload requires a public repo
  or Advanced Security — see the M0 status doc for the open CI findings.

## Consequences

- Governance intent is recorded and reviewable now; enforcement is pending a
  plan/visibility change.
- Required-check names must stay in sync with the workflow/job names in
  `.github/workflows/`.
- Until branch protection is enforced, `main` is unprotected — rely on workflow
  discipline (PRs, CI) by convention.
