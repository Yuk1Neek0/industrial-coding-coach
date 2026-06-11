---
name: integration-polish
description: Cross-feature integration & polish — unified app navigation, catalog→template cross-links, a real PR picker, dead-column cleanup, and schema-collision discipline
status: backlog
created: 2026-06-11T16:57:21Z
---

# PRD: integration-polish

## Executive Summary

M2–M14 shipped fourteen feature areas as vertical slices. Each slice works, but
the seams between them were repeatedly deferred: every feature carries its own
copy of the top navigation (with dead links), the M2 catalog names templates it
never links to, the M8 diff-review flow makes the user type a PR number from
memory, and two dead scaffolding columns from M7 still sit in the
`learning_units` schema. Every one of these gaps is already named in a
milestone retrospective as an unscoped follow-up — this milestone (M16) scopes
them and closes them as one **integration & polish** pass, turning fourteen
parallel slices into one coherent product.

## Problem Statement

The product demos as a collection of pages, not a product:

1. **Navigation is per-feature copy-paste.** 12 `chrome.tsx` files each define
   their own `AppNav`. The copies disagree about which routes exist; the
   catalog copy ships literal dead links (`Templates`, `Sessions`, `Docs` all
   `href="#"`) and a fake ⌘K search affordance. Named as an unscoped follow-up
   in the M4, M6, M7, M8, M12, and M13 retrospectives — six times.
2. **The catalog names templates but doesn't link them.** The M2 catalog
   detail renders `templatesReferenced` as plain-text chips even though every
   value is a template slug guaranteed (by the referential-integrity test) to
   resolve to a registry entry at `/templates/[slug]`. Named in the M3
   retrospective.
3. **Choosing a PR means typing its number.** The M11 GitHub client has
   `getPullRequest` but no `listPullRequests`, so the M8 reviews picker is a
   number-entry form. Named in the M8 and M9 retrospectives.
4. **Dead columns in `learning_units`.** `challenge_concept` /
   `challenge_type` were M7 scaffolding for M9; M9 shipped its own
   `challenges` table and the M9 retrospective says to drop them in a cleanup
   pass. They still pollute the schema, the M7 generation contract, and tests.
5. **Schema-collision discipline is overdue.** The M9 retrospective flags
   (overdue from M8) that parallel epics colliding on `packages/db/src/schema.ts`
   + Drizzle migrations need an agreed rule before the next parallel-schema
   epic. No rule has been written down.

## User Stories

**US-1 — One navigation, everywhere.**
As a learner moving between features, I want the same top navigation on every
page, with working links to every feature area and the current area
highlighted, so the app feels like one product.
*Acceptance criteria:*
- A single shared `AppNav` component is rendered by every feature chrome
  (catalog, templates, recommend, stack, map, repos, issues, challenges,
  reviews, import, portfolio, delivery, observability).
- No `href="#"` dead links and no non-functional affordances (the fake ⌘K
  search is removed or made functional).
- The current feature area is visually highlighted on every page.
- Repo-scoped areas (issues, challenges, portfolio, delivery, observability)
  are reachable through a sensible entry point (e.g. via Repos) rather than
  broken absolute links.

**US-2 — Catalog chips link to the registry.**
As a learner reading a Golden Path, I want each referenced template chip to
link to its `/templates/[slug]` detail page so I can inspect the template the
path builds on.
*Acceptance criteria:*
- Every `templatesReferenced` chip on the catalog detail page is a link to
  `/templates/[slug]`.
- The "M2 · plain text" hint is replaced/updated.
- Curated and Backstage-imported templates both resolve (the integrity test
  already guarantees slug resolution).

**US-3 — Pick a PR from a list.**
As a learner starting a diff review, I want to pick a pull request from a list
of the repo's PRs instead of typing a number from memory.
*Acceptance criteria:*
- The GitHub client gains `listPullRequests` with the same typed-error and
  bounded-pagination shape as the existing methods, covered by tests.
- The reviews PR picker shows a selectable list (number, title, state) when
  the list loads, and falls back to number entry when it can't (offline /
  rate-limited), preserving the current path.

**US-4 — Clean schema, honest contract.**
As a maintainer, I want the dead M7 stub columns removed so the schema and the
M7 generation contract describe only what the product actually uses.
*Acceptance criteria:*
- `challenge_concept` and `challenge_type` are dropped from `learning_units`
  via a new Drizzle migration.
- The M7 generation/grading library, integrity check, learning-memory
  composition, and all tests no longer reference the stub fields.
- `@workspace/db` tests stay green; no other table is touched.

**US-5 — A written schema-collision rule.**
As the project's delivery workflow owner, I want the parallel-epic
schema-collision rule written down so the next parallel-schema epic follows it
instead of rediscovering the problem.
*Acceptance criteria:*
- A short ADR records the chosen discipline: only one epic touches
  `packages/db/src/schema.ts` + migrations at a time; if parallel schema work
  is unavoidable, the merge-time "regenerate as N+1 via `drizzle-kit generate`
  against main's latest snapshot" checklist applies.
- The epic-merge checklist is added where future epics will find it.

## Functional Requirements

- FR-1: Shared `AppNav` component in `apps/web` rendering brand, feature
  links, and active-state highlight; adopted by all 12 existing `chrome.tsx`
  files (which keep their feature-specific exports like `Badge`).
- FR-2: Catalog detail `templatesReferenced` chips render as `next/link`
  links to `/templates/[slug]`.
- FR-3: `listPullRequests(ref, options?)` on the GitHub client: returns
  number/title/state/updatedAt per PR, bounded pagination with a documented
  cap and `truncated` flag, typed errors (`not_found`, `rate_limited`, ...)
  consistent with existing methods.
- FR-4: Reviews picker consumes `listPullRequests` via a server action,
  renders a list, and degrades to the existing number-entry form on error.
- FR-5: Drizzle migration `0013` drops the two stub columns; code and tests
  pruned accordingly.
- FR-6: ADR + checklist documenting the schema-collision discipline.

## Non-Functional Requirements

- Local-first is unchanged: the only network surface remains the existing
  GitHub client; `listPullRequests` is read-only on the already-granted scope.
- No new dependencies.
- No visual redesign: the shared nav reuses the existing `.nav` styling
  conventions; this is consolidation, not a restyle (no v0/Page Spec needed —
  no new page is designed).
- All existing quality gates pass: `pnpm lint`, `pnpm typecheck`,
  `pnpm build`, `@workspace/db` tests, CI on the PR.

## Success Criteria

- Zero `href="#"` links in `apps/web`.
- Exactly one `AppNav` definition in the codebase (component file), 0
  duplicated copies.
- Catalog detail template chips navigate to working template detail pages.
- Reviews flow: a PR can be started from the picker list without typing its
  number (when the repo has PRs and the API is reachable).
- `grep challenge_concept` returns nothing under `packages/db/src` and
  migrations include the drop.
- ADR for schema-collision discipline merged.
- CI green on the epic PR; human review approves.

## Constraints & Assumptions

- Workflow constraints: CCPM epic `integration-polish`, one `epic/<name>`
  branch, `Issue #N:` commits, AI self-review before PR, CI as the merge gate
  (per CLAUDE.md and ADR 0008).
- Windows dev environment: verification runs in the main checkout; cold
  worktrees cannot boot Vitest (recorded gotcha) — CI is the final gate.
- Assumption: the existing `.nav` CSS is shared (globals) so a single nav
  component can serve all feature areas without a restyle.
- Assumption: dropping the stub columns is safe because M9's `challenges`
  table owns challenge data and M13 confirmed `generateLearningUnit` /
  `gradeLearningUnit` have no production callers yet.

## Out of Scope

- New feature surface: snapshot-view route / in-app file viewer (M5/M6/M11
  follow-ups) — deferred, separate milestone candidate.
- Live GitHub import of Backstage templates (M14 follow-up) — separate
  milestone candidate.
- Langfuse export adapter and cross-repo trace dashboard (M13 follow-ups).
- M12 per-node teaching popovers and closing-PR title enrichment.
- Golden Path content referencing imported Backstage templates (content task).
- Any visual redesign, theming, or new search feature (the fake ⌘K is
  removed, not implemented).
- Team/Classroom mode (M15) — explicitly shelved.

## Dependencies

- Internal: M2 catalog UI, M3 templates UI + resolver, M11 GitHub client
  (`packages/db/src/github/client.ts`), M8 reviews UI, M7/M9/M10 learning-unit
  code paths touched by the column drop, Drizzle migration chain (last:
  `0012_brainy_boomer.sql`).
- External: GitHub REST `GET /repos/{owner}/{repo}/pulls` (list) for FR-3.
- No new packages.
