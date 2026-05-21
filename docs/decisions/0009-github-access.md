# ADR 0009 — GitHub Repository Access

- **Status:** Accepted
- **Date:** 2026-05-21

## Context

Milestone 11 (GitHub Integration, pulled forward) gives the product its ability
to import a **remote GitHub repository** by URL — file tree, key files, and
metadata — into local storage so later analysis milestones (M5 Stack Explainer,
M6 Project Logic Mapper, M8 Diff Review) can coach a user's *real* project.

This is the product's **first network dependency**. Until now the product ran
only against the local repository it lives in (ADR 0006 storage, M1/M2). The
github-integration PRD (`.claude/prds/github-integration.md`) requires a single
ADR to settle three GitHub-access decisions before the epic's implementation
tasks run:

1. **Authentication** — how the product authenticates to GitHub, and at what
   permission scope.
2. **Rate-limit handling** — how the product behaves against GitHub API rate
   limits.
3. **Snapshot storage** — where an imported repository's snapshot is persisted.

Constraints from the product PRD and the github-integration PRD:

- **Local-first.** Import produces a *local* snapshot; downstream analysis runs
  offline against it. GitHub is contacted only at import time.
- **Read-only.** The product never writes to a user's GitHub repository — no
  issues, no PRs, no pushes.
- **Secure.** No secret is ever committed; the `.env` / `.env.example` pattern
  (already used for `DB_FILE_NAME`) is followed.
- **MVP boundary.** Import covers repo tree + key files + metadata. Issues, PRs,
  and diffs are a later M11 phase and are out of scope here.
- **Consistent.** Storage and access patterns mirror the M2 conventions in
  `packages/db` (Drizzle, SQLite — ADR 0006).

Options were considered for each of the three decisions:

- **Authentication** — (a) anonymous / unauthenticated requests; (b) a GitHub
  personal access token read from `.env`; (c) the `gh` CLI's stored credentials
  (`gh auth`); (d) a GitHub App / OAuth flow.
- **Rate-limit handling** — (a) ignore limits and let requests fail; (b) detect
  the rate-limit response, stop cleanly, and surface an actionable error;
  (c) automatic blocking retry / backoff until the window resets.
- **Snapshot storage** — (a) the existing catalog SQLite database (ADR 0006);
  (b) a separate SQLite database file dedicated to snapshots; (c) a local
  on-disk file cache (JSON/blobs per repo).

## Decision

### 1. Authentication — optional GitHub token via `.env`, read-only scope

The product reads an **optional** GitHub personal access token from an
environment variable, `GITHUB_TOKEN`, loaded from `.env` (git-ignored).
`.env.example` documents the variable as an empty placeholder — never a real
token.

- **Optional.** With no token, import works against **public** repositories at
  GitHub's unauthenticated rate limit (60 requests/hour).
- **Token configured.** A token unlocks **private** repositories the token can
  access and the far higher authenticated rate limit (5,000 requests/hour).
- **Read-only scope.** The token only ever needs read access — a fine-grained
  token with read-only "Contents" + "Metadata" permissions, or a classic token
  with the `repo` scope (read use only) for private repos; no scope at all is
  needed for public repos. The product issues only `GET` requests and never
  writes to GitHub. This is documented next to the variable in `.env.example`.
- The `gh` CLI is **not** required. A later task may optionally fall back to
  `gh auth token` to discover an existing credential, but the env var is the
  primary, documented mechanism. A GitHub App / OAuth flow is rejected as
  disproportionate for a single-user, local-first tool.

### 2. Rate-limit handling — detect, stop cleanly, surface an actionable error

The GitHub API client (task #38) **detects** rate-limit exhaustion and **fails
cleanly with a clear, actionable message** rather than hanging or crashing.

- A `403`/`429` response with `x-ratelimit-remaining: 0` is recognized as
  rate-limit exhaustion (distinct from an auth failure).
- The error surfaced to the user names the cause and the fix: the reset time
  (from the `x-ratelimit-reset` header) and the suggestion to configure a
  `GITHUB_TOKEN` for the higher authenticated limit.
- The client **fetches selectively** to *stay under* the limit in the first
  place: it fetches the repo metadata and the recursive tree, then fetches the
  contents of only the **key files** (`package.json`, lockfiles,
  framework/build config, README, CI workflow files) — never every file.
- No automatic blocking retry/backoff loop is built for the MVP. Unauthenticated
  resets can be up to an hour away; silently blocking that long is worse than a
  clear error. Backoff for transient `5xx`/secondary limits may be added later
  as a bounded enhancement if needed.

### 3. Snapshot storage — the existing catalog SQLite database (confirms ADR 0006)

Imported repository snapshots are stored in the **existing catalog SQLite
database** — the same single local file introduced by ADR 0006 — via new
Drizzle tables, **not** a separate database file and **not** a file cache.

- New tables are added to `packages/db/src/schema.ts`, created by a Drizzle
  migration, mirroring the `golden_paths` table conventions (scalar columns;
  list-/tree-valued fields as JSON text columns).
- A snapshot is keyed by `owner` + `repo` + `ref`, so re-importing the same
  repo/ref updates one row (PRD US-3, re-import to refresh).
- The generated `.db` file stays git-ignored (ADR 0006); the schema + migration
  are the reviewed source of truth.

The MVP snapshot shape is two tables: `repo_snapshots` (one row per imported
`owner/repo@ref` — metadata + the full file tree as a JSON column), and
`repo_files` (one row per imported key-file's content, child of a snapshot).
This is detailed by the schema delivered alongside this ADR.

## Rationale

- **Optional token via `.env`.** A junior dev's portfolio repo is often public;
  requiring a token to import a public repo would be friction with no benefit.
  Making the token optional keeps the zero-config path working while still
  supporting private repos and the higher rate limit (PRD US-1, US-4). The
  `.env` pattern is already established for `DB_FILE_NAME`, so this introduces
  no new secret-handling mechanism. Read-only scope matches the hard constraint
  that the product never writes to a user's repo.
- **Detect-and-surface rate limiting.** The product's thesis is *no opaque
  magic* — a clear "rate limit hit, resets at HH:MM, set GITHUB_TOKEN" message
  teaches the user what happened and how to fix it, which a silent hour-long
  block does not. Selective key-file fetching is the real defense: it keeps a
  typical import to a handful of requests, well under even the 60/hour
  unauthenticated limit.
- **Reuse the catalog SQLite DB.** ADR 0006 already chose SQLite + Drizzle for
  local-first structured, queryable storage; snapshots have the same shape of
  need (a typed data-access layer in task #40 will query the tree and files).
  Reusing one database keeps one migration tool, one client, one backup unit,
  and one set of conventions — a separate DB file or an ad-hoc file cache would
  fragment the data layer for no gain. A file cache also loses the query
  ability the data-access layer needs. This **confirms** ADR 0006's storage
  choice rather than overriding it.

## Consequences

- The product gains its **first network dependency** (the GitHub REST API),
  contacted only at import time; the local-first guarantee is preserved because
  downstream analysis reads the SQLite snapshot, never the network.
- `GITHUB_TOKEN` is added to `.env.example` as an empty placeholder; `.env`
  stays git-ignored. No token is ever committed.
- The catalog SQLite database now stores two concerns — the Golden Path catalog
  and imported repo snapshots. They are independent table sets in one file;
  ADR 0006's "one local DB" model still holds.
- New Drizzle tables (`repo_snapshots`, `repo_files`) and a migration are added
  to `packages/db`, following the M2 migration workflow (`db:generate`).
- Tasks #38–#40 build on this ADR: #38 (API client + token auth + rate-limit
  handling), #39 (import module + key-file selection), #40 (typed data-access
  layer) all depend on the access decisions and storage shape settled here.
- If a later M11 phase imports issues/PRs/diffs, or if rate limits prove painful
  in practice and a backoff/retry strategy is wanted, this ADR is revisited
  rather than silently widened.
- Complements ADR 0006 (storage) and ADR 0008 (parallel execution — M11 runs as
  the `epic/github-integration` worktree). Supersedes nothing.
