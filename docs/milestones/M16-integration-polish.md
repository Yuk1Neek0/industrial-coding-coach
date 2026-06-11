# M16 — Integration & Polish

**State:** ✅ Complete — epic #255 done; merged to `main` via **PR #262**
(`a84fecb`) · **Date:** 2026-06-11

Goal: close the five cross-feature gaps every retrospective since M3 had
deferred — one shared navigation instead of 12 copies, catalog→template
cross-links, a real PR picker, removal of the dead M7 stub columns, and a
written schema-collision discipline — turning fourteen vertical slices into
one coherent product. No new dependencies, no redesign, no new feature
surface.

## Scope decisions

- **Consolidation, not restyle.** The shared `AppNav`
  (`apps/web/app/_components/app-nav.tsx`) reuses the existing `.nav` CSS
  conventions; feature chromes re-export it so page imports kept compiling.
  Links go only to real top-level routes (AD-2); the fake ⌘K affordance and
  all `href="#"` dead links were removed, not implemented.
- **`/repos` redirects to `/import`.** The nav's Repos entry needs a landing
  page but no repos index exists; a real repos hub would be new UI surface
  (Page-Spec route), so a one-line redirect to the de-facto entry point was
  chosen and the hub recorded as a follow-up.
- **`listPullRequests` mirrors the existing client shape** (AD-3): typed
  errors, bounded pagination with cap + `truncated`, default
  `DEFAULT_MAX_PULL_REQUESTS = 300`; the reviews picker caps its listing at
  50 (one API request) and keeps number entry as the offline path.
- **Only one schema-touching task** (AD-4), honoring ADR 0011 — written in
  this same epic (#261): serialize schema work across epics by default;
  merge-time regenerate-as-N+1 checklist as the escape hatch.

## Stage status

| Stage | Description | Status |
|---|---|---|
| 1 | CCPM Plan — PRD `integration-polish.md` | Done — approved |
| 2 | CCPM Epic → Structure → Sync | Done — epic #255, tasks #256–#261 |
| 3 | Execution (5 parallel sub-agents + main session) | Done — see backlog |

## Execution backlog

| Wave | Issue | Task |
|---|---|---|
| 1 | #256 | Shared AppNav + adoption across 12 chromes (+ `/repos` redirect) |
| 1 | #257 | Catalog template chips → `/templates/[slug]` links |
| 1 | #258 | GitHub client `listPullRequests` + tests |
| 1 | #260 | Drop M7 stub columns: code/test prune + migration `0013` |
| 1 | #261 | ADR 0011 schema-collision discipline (main session, parallel) |
| 2 | #259 | Reviews PR picker: selectable list + number-entry fallback |

All 6 task issues + epic #255 are closed; the epic is archived to
`.claude/epics/archived/integration-polish/`. Merged via **PR #262**.

## Delivered

- `apps/web/app/_components/app-nav.tsx` — the single `AppNav` (+
  `AppNavArea` union); 12 chromes now re-export it (−776 lines of copies);
  zero `href="#"` in `apps/web`; repo-scoped pages highlight `repos`;
  `apps/web/app/repos/page.tsx` redirects to `/import`.
- `apps/web/app/catalog/_components/detail-view.tsx` — `templatesReferenced`
  chips are `next/link` links to the registry (+ `a.chip:hover` state).
- `packages/db/src/github/client.ts` — `listPullRequests(ref, { state?,
  maxPullRequests? })` → `{ pullRequests: { number, title, state, updatedAt
  }[], truncated }`, typed errors, bounded pagination; 5 new tests; 4 mock
  clients updated.
- `apps/web/app/reviews/[owner]/[repo]/` — `listOpenPullRequestsAction` +
  picker list (number/title/state/updated) with typed-error, empty, and
  truncated fallbacks to the preserved number-entry form.
- `packages/db` — `learning_units` loses `challenge_concept`/
  `challenge_type` (migration `0013_calm_harpoon.sql`); the M7 generation
  contract is six-part; `apps/web` stub consumers pruned incl. deleting the
  deferred-to-M9 `ChallengePanel`.
- `docs/decisions/0011-schema-collision-discipline.md` + decisions index
  rows for 0010 (previously missing) and 0011.

## Acceptance Criteria (PRD)

- [x] Zero `href="#"` links in `apps/web`; exactly one `AppNav` definition.
- [x] Catalog chips navigate to working template detail pages (curated +
      Backstage).
- [x] A PR can be started from the picker list; typed-error/empty/truncated
      states degrade to number entry.
- [x] Stub columns dropped via migration; `packages/db/src` greps clean for
      the M7 stub fields; db tests green.
- [x] ADR 0011 merged and linked from the decisions index.
- [x] `pnpm lint` / `typecheck` / `build` pass; db tests 841/841, web tests
      45/45; CI green on PR #262.

## Retrospective

**What went well**

- **Retro-driven scoping wrote itself.** Every PRD item cited the milestone
  retrospective that had deferred it; acceptance criteria were greps and
  test counts, so "done" was mechanical to verify.
- **Parallel agents + central verification fit Windows.** Five tasks ran as
  background sub-agents in isolated worktrees with a hard "no install/test"
  rule; linear `Issue #N:` history via cherry-pick; lint/typecheck/tests/build
  ran once, centrally, in the main checkout — first run green on all 886
  tests.
- **Agents surfaced real gaps beyond their prompts.** #260's agent flagged
  apps/web stub consumers the task file missed; #256's agent flagged the
  `/repos` 404. Both were resolved in-session within scope discipline.
- **ADR 0011 was applied in the epic that wrote it**: one schema-touching
  task, migration generated centrally via `drizzle-kit generate`.

**What to watch — lessons**

- **Agent worktrees fork from `main`, not the current branch.** Wave-2's
  agent needed an explicit "merge the epic branch first" instruction;
  wave-1 agents couldn't see the committed task files and read them from
  the main checkout path instead. Bake this into future agent prompts.
- **Agent worktree directories can stay handle-locked after completion** —
  `git worktree remove` hits Permission denied until the holding process
  exits; prune the registration immediately, delete directories at session
  end (long-path-safe `\\?\` delete).
- **Task files should enumerate cross-package consumers.** #260 scoped
  `packages/db` but the stub fields leaked into `apps/web` (view type,
  page, a whole stub component); a pre-decomposition grep across the repo
  would have caught it.

**Follow-ups**

- A real `/repos` hub page (listing imported repos with links to their
  per-repo areas) — would replace the redirect; needs a Page Spec.
- Custom focus ring on chip links; unused `.nav-end`/`.mark-label` CSS rules
  left in per-feature stylesheets (cosmetic).
- Pre-existing unused-var lint warning in `apps/web/lib/learning-units.test.ts`
  (on `main` before this epic).
- The deferred candidates from the M16 PRD's out-of-scope list remain the
  next milestone pool: snapshot-view/file-viewer route, live Backstage
  import over M11, Langfuse export adapter, M15 Team/Classroom mode.
