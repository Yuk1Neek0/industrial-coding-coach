---
name: integration-polish
status: in-progress
created: 2026-06-11T16:57:21Z
updated: 2026-06-11T17:05:22Z
progress: 0%
prd: .claude/prds/integration-polish.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/255
---

# Epic: integration-polish

## Overview

M16. Close the five cross-feature gaps that every retrospective since M3 has
deferred: one shared `AppNav` instead of 12 copies (with dead links), catalog
template chips that actually link to `/templates/[slug]`, a real PR picker
backed by a new `listPullRequests` client method, removal of the dead M7 stub
columns from `learning_units`, and a written schema-collision discipline for
parallel epics. No new feature surface, no new dependencies, no redesign —
this epic consolidates what already exists.

## Architecture Decisions

- **AD-1 — One nav component, app-owned.** The shared `AppNav` lives in
  `apps/web/app/_components/app-nav.tsx` (not `packages/ui`): it encodes app
  routes, which are `apps/web` knowledge. Feature `chrome.tsx` files keep
  their other exports (e.g. `Badge`) and re-render `AppNav` with an `active`
  key. Existing `.nav` CSS conventions are reused — no restyle.
- **AD-2 — Links only to real routes.** Dead links (`href="#"`) and the fake
  ⌘K affordance are removed. Repo-scoped areas (issues, challenges, portfolio,
  delivery, observability) are reached through `Repos`, not faked as top-level
  links.
- **AD-3 — `listPullRequests` mirrors existing client shape.** Same typed
  errors, bounded pagination with cap + `truncated` flag, same test style as
  `getPullRequestFiles`. Read-only; no scope change.
- **AD-4 — Column drop is a plain additive-chain migration.** Migration
  `0013` drops `challenge_concept`/`challenge_type` from `learning_units`;
  the M7 generation contract and integrity/composition code are pruned in the
  same task so schema and code stay in lockstep. The only schema-touching
  task in this epic (honors the discipline ADR written in this same epic).
- **AD-5 — Discipline is documented as an ADR.** Default rule: one epic
  touches `schema.ts` + migrations at a time; unavoidable parallel schema work
  uses the merge-time regenerate-as-N+1 checklist.

## Technical Approach

### Frontend Components

- New `apps/web/app/_components/app-nav.tsx`: brand, links (Home, Catalog,
  Templates, Recommend, Stack, Map, Repos, Reviews, Import), `active` prop,
  active-state styling per current `.nav` conventions.
- 12 `chrome.tsx` files swap their local `AppNav` for the shared one.
- `catalog/_components/detail-view.tsx`: chips become `next/link` to
  `/templates/[slug]`.
- `reviews/[owner]/[repo]/_components/pr-picker.tsx` + `actions.ts`: list
  PRs via server action; selectable list (number, title, state); fall back to
  number entry on typed error.

### Backend Services

- `packages/db/src/github/client.ts`: `listPullRequests(ref, options?)` →
  `{ number, title, state, updatedAt }[]` with bounded pagination; tests in
  `pull-requests.test.ts` style.
- `packages/db/src/schema.ts` + `drizzle/0013_*.sql`: drop the two stub
  columns; prune `learning-units/generate.ts` contract, `units.ts`,
  `integrity.ts`, `learning-memories/compose.ts`, and all referencing tests.

### Infrastructure

- None. No new deps, no CI changes. Docs: one ADR
  (`docs/decisions/0011-schema-collision-discipline.md`) + epic-merge
  checklist note.

## Implementation Strategy

Single epic branch `epic/integration-polish`. Wave 1 runs the five
independent tasks in parallel (disjoint file sets); Wave 2 is the PR-picker
UI, which depends on the client method. Verification (`pnpm lint`,
`typecheck`, `build`, db tests) runs in the main checkout per the Windows
worktree gotcha; CI on the PR is the final gate.

## Task Breakdown Preview

- [ ] #256 — Shared AppNav component + adoption across all feature chromes (parallel)
- [ ] #257 — Catalog detail template chips link to `/templates/[slug]` (parallel)
- [ ] #258 — GitHub client `listPullRequests` + tests (parallel)
- [ ] #259 — Reviews PR picker list UI over `listPullRequests` (after #258)
- [ ] #260 — Drop M7 stub columns: migration 0013 + code/test prune (parallel)
- [ ] #261 — ADR 0011: schema-collision discipline + epic-merge checklist (parallel)

## Dependencies

- Internal: M2 catalog UI, M3 template resolver + detail route, M11 GitHub
  client, M8 reviews flow, M7/M9/M10 learning-unit code paths, Drizzle chain
  (last migration: `0012_brainy_boomer.sql`).
- External: GitHub REST `GET /repos/{owner}/{repo}/pulls`.
- No new packages.

## Success Criteria (Technical)

- Zero `href="#"` in `apps/web`; exactly one `AppNav` definition.
- Catalog chips navigate to working template pages (curated + backstage).
- PR picker lists PRs and starts a review without manual number entry;
  degrades to number entry on typed error.
- `challenge_concept|challengeConcept` greps clean in `packages/db/src`
  (modulo the drop migration); db tests green.
- ADR 0011 merged.
- `pnpm lint` / `typecheck` / `build` pass; CI green on the epic PR.

## Estimated Effort

~14–15 hours across 6 tasks (XS–M each); 5 of 6 tasks parallelizable.
Critical path: 003 → 004.

## Tasks Created

- [ ] #256 — Shared AppNav component + adoption across feature chromes (parallel: true)
- [ ] #257 — Link catalog template chips to template detail pages (parallel: true)
- [ ] #258 — GitHub client listPullRequests with bounded pagination (parallel: true)
- [ ] #259 — Reviews PR picker: selectable list with number-entry fallback (parallel: false, depends on #258)
- [ ] #260 — Drop M7 stub columns from learning_units (migration 0013) (parallel: true)
- [ ] #261 — ADR 0011: schema-collision discipline + epic-merge checklist (parallel: true)

Total tasks: 6
Parallel tasks: 5
Sequential tasks: 1
Estimated total effort: ~14.5 hours
