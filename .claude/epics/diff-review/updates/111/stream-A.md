---
issue: 111
stream: pr-fetch
started: 2026-05-22T15:10:00Z
status: in_progress
---

# Issue #111 — PR fetching + change model

## Scope

Extend the shipped M11 GitHub client (`packages/db/src/github`) with
pull-request fetching and a typed change model the M11 review call (#112)
reasons over.

## Plan

1. New module `packages/db/src/github/pull-requests.ts`:
   - Reuse `createGitHubClient`'s auth + access path (ADR 0009) — no new client.
   - Fetch PR metadata, the unified diff/patch, the changed-file list, and the
     linked issue where one exists.
   - Parse the unified diff into a typed change model: changed files, hunks,
     additions/deletions, linked-issue acceptance criteria.
   - Gracefully handle a very large PR (cap files/patch) and a PR with no
     linked issue.
2. Tests `pull-requests.test.ts` with mocked GitHub responses (no live calls).
3. Export the new surface from `index.ts`.

## Progress

- Studied existing client, errors, key-files, ADR 0009, and test patterns.
- Implementing `pull-requests.ts`.
</content>
