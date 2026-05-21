# M11 — GitHub Integration

**State:** ✅ Complete — epic #36 done & archived; Import UI live at `/import`
· **Date:** 2026-05-21

Goal: let the coach point at a real GitHub repository — import its file tree
and key files into a local-first snapshot the analysis milestones read. Built
in parallel with M3 via git worktrees (ADR 0008).

## Scope decisions

- **MVP scope is repository import.** The milestone plan's one-line M11
  ("import GitHub repos, issues, PRs, and diffs") was scoped down: the epic
  delivers **repo import** (metadata, file tree, key-file contents). Issues,
  PRs, and diffs are deferred to a later iteration.
- **Local-first (ADR 0009).** GitHub is contacted only at import time; every
  downstream milestone reads the local snapshot, never the network.
- **Read-only.** The client issues only GET requests — it never writes to a
  user's repository.
- **Auth is optional.** A `GITHUB_TOKEN` in `.env` raises the rate limit and
  unlocks private repos; with no token the client works against public repos.
  The UI never collects a token.

## Stage status

| Stage | Description | Status |
|---|---|---|
| 1 | CCPM Plan — PRD `github-integration.md` | Done — approved |
| 2 | CCPM Epic → Structure → Sync | Done — epic #36, tasks #37–#42 |
| 3 | Execution + UI hand-off | Done — see backlog |

## Execution backlog

| Issue | Task | Status |
|---|---|---|
| #37 | GitHub-access ADR 0009 + snapshot schema + migration | ✅ Done — `759e917` |
| #38 | GitHub API client + token auth + rate-limit/error handling | ✅ Done — `5bb9bf2` |
| #39 | Repo import module + key-file selection | ✅ Done — `49eebad` |
| #40 | Typed data-access layer + tests | ✅ Done — `40966f8` |
| #41 | Import page spec + Claude Design prompt | ✅ Done — `8128c6e` |
| #42 | Integrate the Import UI page | ✅ Done — `11e80f4` |

All 6 task issues + epic #36 are closed; the epic is archived to
`.claude/epics/archived/github-integration/`. Merged to `main` via **PR #49**
(`205a1cb`).

## Delivered

- ADR 0009 — GitHub access model (local-first, read-only, optional token).
- `packages/db` — `repo_snapshots` + `repo_files` schema + migration; a
  read-only GitHub REST client (token auth, file tree / content, typed
  rate-limit + boundary errors); a repo-import module with key-file selection
  (manifest, lockfile, build config, README, CI); a typed data-access layer.
  101 Vitest tests.
- Import UI: `/import` — a Server Component shell with a Client Component
  island for the interactive flow (idle → in-progress → success → error),
  calling a Server Action over the data-access layer. UI tool: Claude Design
  (ADR 0007) — see `docs/design/ui-integration-notes/`.

## Acceptance Criteria (PRD)

- [x] A repo is imported by URL into a local snapshot (file tree + key files).
- [x] Re-importing the same repo updates the snapshot in place (US-3).
- [x] All four boundary errors (invalid URL, not found, rate-limited, auth)
      plus a generic fallback surface as clear, actionable, in-page states —
      no raw status codes or stack traces.
- [x] GitHub is contacted only at import; downstream reads the local snapshot.
- [x] The page never collects a token; the private-repo hint points at `.env`.

## Retrospective

**What went well**

- The backend chain #37 → #40 is fully typed: every boundary failure is a
  discriminated `GitHubResult` value, so there is no thrown control flow for
  expected errors and the UI maps `kind` → copy exhaustively.
- Local-first held end to end — the only network call in the product is the
  import itself.
- Beginner-first error copy: the UI renders curated per-kind explanations, not
  the data-access messages (which name HTTP codes the page spec forbids
  showing).

**What to watch — lessons**

- **`lucide-react` no longer ships brand icons.** `import { Github }` failed
  typecheck; the GitHub mark is now a small inline SVG (`GitHubMark`). Worth
  knowing for any future page that wants a brand glyph.
- The success view's "View imported repository" forward action was **omitted**
  — no destination route exists yet. The page spec anticipated this ("hide it
  rather than link nowhere"); a later milestone that adds a snapshot-view route
  should wire it back in.
- Task #41's title still said "v0 prompt" (ADR 0007 → Claude Design) — CCPM
  task titles drifted from the ADRs.

**Cross-cutting (shared with M3)**

- M11 and M3 ran in parallel via git worktrees — both added a Drizzle `0001`
  migration, which collided on merge. M11 merged first cleanly; M3's PR then
  had to regenerate its migration as `0002`. **Lesson:** parallel epics that
  both touch `packages/db` migrations should expect a regenerate-on-merge step.

**Follow-ups**

- Importing issues, PRs, and diffs — deferred from the plan's M11 line.
- A snapshot-view route, which would re-enable the Import success page's
  forward action.
