# ADR 0011 — Schema-Collision Discipline for Parallel Epics

- **Status:** Accepted
- **Date:** 2026-06-11

## Context

ADR 0008 lets epics run in parallel on separate `epic/<name>` branches. The
M8/M9 parallel run showed the failure mode of that model: two epics each
generated a Drizzle migration with the same sequence number against the same
`packages/db/src/schema.ts` baseline, and the second epic to merge collided —
both the migration *number* and the drizzle `meta/` snapshot chain conflicted.
The M9 retrospective (`docs/milestones/M9-debug-expansion-challenge.md`,
Follow-ups) marked choosing a discipline as **overdue** before the next
parallel-schema epic, with two candidate rules:

1. Serialize schema work — only one epic touches `packages/db/src/schema.ts`
   plus `packages/db/drizzle/` at a time; others rebase once that schema lands
   on `main`.
2. Formalize a merge-time chore — the merging epic regenerates its migration
   as `N+1` via `drizzle-kit generate` against `main`'s latest snapshot.

These are not mutually exclusive: one is a planning rule, the other a recovery
playbook.

## Decision

**Default rule — serialize schema work across epics.** During CCPM epic
decomposition, any task that edits `packages/db/src/schema.ts` or adds a
migration under `packages/db/drizzle/` marks the epic as *schema-touching*.
At most one schema-touching epic runs at a time; a second epic that needs a
schema change waits for (or rebases onto) the first epic's schema landing on
`main`. Within an epic, schema-touching tasks are likewise serialized
(`conflicts_with` in the task frontmatter).

**Escape hatch — merge-time regeneration.** If parallel schema work proves
unavoidable, the *later-merging* epic owns the fix-up, using this checklist
before its PR is marked ready:

1. Rebase the epic branch onto current `main` (or merge `main` in, per the
   epic's history convention).
2. Delete the epic's own generated migration file(s) **and** their entries in
   `packages/db/drizzle/meta/_journal.json`, plus the epic's `meta/`
   snapshot(s) — never edit `main`'s migrations or snapshots.
3. Re-run `pnpm drizzle-kit generate` (from `packages/db`) so the migration is
   regenerated as `N+1` against `main`'s latest snapshot.
4. Run the in-memory-migrate test suite (`@workspace/db` tests) to prove the
   chain applies cleanly from scratch.
5. Note the regeneration in the PR description (old number → new number).

The checklist lives here; epic planning references this ADR whenever a
schema-touching task is created (as M16's epic does in its AD-4).

## Consequences

- Parallel epics stay parallel for app/UI/library work; only the narrow
  schema+migration surface is serialized, which matches how small this
  repo's migrations are in practice.
- The migration chain on `main` remains strictly linear and append-only,
  which the in-memory-migrate test pattern (used since M3) depends on.
- A late-merging epic pays a known, bounded fix-up cost (the checklist)
  instead of an ad-hoc conflict resolution under merge pressure — the M8/M9
  incident is the playbook's worked example.
- CCPM epics must declare schema-touching tasks during decomposition, which
  the epic template's architecture-decisions section already accommodates.
