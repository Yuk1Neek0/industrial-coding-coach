---
name: github-integration
description: Import a GitHub repository — its file tree, key files, and metadata — so later milestones can coach a user's real project
status: backlog
created: 2026-05-21T00:33:03Z
---

# PRD: github-integration

## Executive Summary

GitHub Integration (Milestone 11, pulled forward) gives Industrial Coding Coach
the ability to point at a **GitHub repository by URL** and import it for
analysis. Today the product can only coach the local repo it runs inside; M11
lets a user supply their own **remote** project.

M11 is pulled forward from its original "Future Milestone" status because **M5
(Stack Decision Explainer) depends on it**. M5's scope was settled as explaining
the stack of the user's *actual GitHub repository* — and M11 is the milestone
that delivers that project's data. M11 is therefore the repo-import foundation
that the analysis milestones (M5 Stack Explainer, M6 Project Logic Mapper, M8
Diff Review) all consume.

The M11 MVP imports the repository's **file tree, key files, and metadata** into
local storage. Importing issues, PRs, and diffs is a later phase, driven by
M7/M8 — not part of the M5-unblocking MVP.

## Problem Statement

The product's value is coaching a user's *real* AI-built project. A job-seeking
junior dev's portfolio project lives on GitHub. Without an import path the
product can only analyze the repository it is literally running inside — useful
for the maintainer, useless for a user who wants to understand and defend their
own repo.

M11 closes that gap. It is the single ingestion point that turns "the product
runs on a repo" into "the user brings their repo to the product," and every
downstream analysis milestone depends on it.

**Planning note — conflict resolution.** ADR 0008 originally paired M3 ∥ M5 as
independent parallel epics. During M3/M5 PRD planning, M5's scope was settled as
analyzing the user's remote repository, which makes M5 depend on remote import.
M11 is therefore pulled forward to pair with M3 instead; M5 follows M11. ADR
0008 is amended to record this.

## User Stories

### US-1 — Import a repository by URL
As a user, I want to give the product a GitHub repository URL and have it
imported, so that the product can coach my actual project.
**Acceptance:**
- The import UI accepts a GitHub repo URL (and optionally a branch/ref).
- Triggering import fetches the repo and reports success or a clear error.

### US-2 — See the imported repository
As a user, I want to see the imported repo's file tree and key files, so that I
can confirm the right project was imported.
**Acceptance:**
- After import, the repo's file tree is viewable/queryable.
- Key files (package files, config, README) have their contents available.

### US-3 — Re-import to refresh
As a user, I want to re-run import on a repo, so that I get its latest state.
**Acceptance:**
- Re-importing an already-imported repo updates its local snapshot.

### US-4 — Import a private repository
As a user, I want to import my own private repo, so that the product can coach
projects that are not public.
**Acceptance:**
- With a GitHub token configured, a private repo the token can access imports
  successfully.
- No token is ever committed; the `.env` / `.env.example` pattern is followed.

### US-5 — Imported data stays local
As a maintainer, I want imported repositories stored locally, so that the
product stays local-first and analysis runs offline.
**Acceptance:**
- Import produces a local snapshot; downstream analysis reads the snapshot, not
  the network.

## Functional Requirements

- **FR-1 Repository import module.** Given `owner/repo` (and an optional ref),
  fetch the repository's file tree and the contents of selected files via the
  GitHub API (or the `gh` CLI).
- **FR-2 Key-file selection.** Import the files that carry stack and structure
  signal — `package.json`, lockfiles, framework/build config (e.g.
  `next.config.*`, `tsconfig.json`), README, and CI workflow files. File
  contents are fetched selectively to respect size and rate limits.
- **FR-3 Local snapshot storage.** Persist each imported repository locally,
  keyed by `owner/repo` and ref. The storage mechanism (SQLite per ADR 0006, or
  a local file cache) is settled by a new ADR.
- **FR-4 Authentication.** Support a GitHub token (env var or `gh auth`) for
  private repositories and higher rate limits. The token lives in `.env`
  (git-ignored); `.env.example` documents it.
- **FR-5 Data-access layer.** A typed module to import a repo, list imported
  repos, get a repo's file tree, and get a file's content — usable server-side
  by the Next.js app.
- **FR-6 Import UI.** A web page in `apps/web` to enter a repo URL, trigger
  import, and show import status and result. Built via the page-spec → v0 →
  Claude Code integration flow (v0 rule).
- **FR-7 Boundary error handling.** Invalid URL, repository not found, rate
  limit exceeded, and authentication failure are each surfaced to the user with
  a clear, actionable message.

## Non-Functional Requirements

- **Local-first preserved.** Import produces a *local* snapshot; downstream
  analysis runs offline against it. GitHub is contacted only at import time.
- **Rate-limit aware.** Respect GitHub API rate limits; fetch file contents
  selectively rather than cloning everything.
- **Secure.** The token is read from the environment and never committed; import
  uses read-only access scope.
- **Typed.** Import module and data-access layer are fully typed (TypeScript).
- **Consistent.** Storage and data-access patterns mirror the M2/M3 conventions.

## Success Criteria

- A public GitHub repository can be imported by URL: its file tree, key files,
  and metadata land in local storage.
- A private repository imports successfully when a valid token is configured.
- The import UI can import a repo and display its result and any errors.
- The data-access layer is typed and covered by at least basic tests.
- M5 could read an imported repo's package files and config through the
  data-access layer — the data model supports it.

## Constraints & Assumptions

- **Constraint:** M11 introduces the product's first **network dependency**
  (the GitHub API). A new ADR records the GitHub-access decisions — auth,
  rate-limit handling, and snapshot storage.
- **Constraint:** all product work follows the CCPM workflow; one issue at a
  time; CI green before merge; the import UI follows the page-spec → v0 →
  Claude Code integration flow.
- **Constraint:** M11 runs as an epic on an `epic/github-integration` worktree
  and branch, merged to `main` via PR (ADR 0008, amended).
- **Assumption:** the M11 MVP imports **repo tree + key files + metadata**.
  Importing issues, PRs, and diffs is a later phase of M11 (or a follow-on),
  driven by M7/M8 — it is not needed to unblock M5.
- **Assumption:** import is **read-only**; the product never writes to a user's
  GitHub repository.
- **Assumption:** no multi-user accounts; the configured token belongs to the
  local user.

## Out of Scope

- **The Stack Decision Explainer (M5).** M11 delivers repo data; M5 interprets
  it. M11 ships no stack analysis itself.
- **Project Logic Mapper (M6) and Diff Review (M8).**
- **Issues / PRs / diffs import.** Deferred to a later M11 phase.
- **Writing to GitHub.** No creating issues/PRs, no pushing — the product is
  read-only against the user's repo.
- **Non-GitHub sources.** GitLab, Bitbucket, and raw archive upload are out of
  scope.
- **Webhooks / live sync.** Import is on-demand.
- **Authentication accounts, multi-user data.**

## Dependencies

- **M0 foundation** (complete) — monorepo, CI, security baseline.
- **ADR 0006** — local SQLite storage — likely reused for snapshot storage.
- **ADR 0005** — LLM integration — M11 is mostly ingestion, with minimal LLM use.
- **A new ADR** — GitHub access (authentication, rate limits, snapshot storage)
  — to be created with or alongside this PRD before the M11 epic runs.
- **ADR 0008** — parallel execution model; M11 runs in parallel with M3
  (amended pairing).
- **M5 (Stack Decision Explainer)** — depends on M11; will consume imported repo
  data.
- **Human review** — approval of this PRD and the new GitHub-access ADR is
  required before the M11 epic is executed.
