# Integration notes: Challenge List Page

Issue: #148 · Page Spec: `docs/design/challenge-list-page.md` (#144) · ADR
0007 (Claude Design — `docs/decisions/0007-ui-generation-tool.md`).

This file records the deviations between the Page Spec (#144) and the
shipped React implementation at
`apps/web/app/repos/[owner]/[repo]/challenges/page.tsx`. Per ADR 0007, the
Claude Design round-trip is **Page Spec → Claude Design prompt → Claude
Design draft → integration notes**; task #148 ships the *integration notes*
documenting deviations (the Claude Design draft itself is a manual external
step, not invoked by Claude Code).

## Components shipped

- `apps/web/app/repos/[owner]/[repo]/challenges/page.tsx` — the Server
  Component page shell.
- `apps/web/app/repos/[owner]/[repo]/challenges/_components/chrome.tsx` —
  shared M9 chrome (`AppNav`, `Badge`, `AiLabel`, stroke icons, `relTime`),
  mirrors `apps/web/app/reviews/_components/chrome.tsx`.
- `apps/web/app/repos/[owner]/[repo]/challenges/_components/list-row.tsx` —
  the Client Component island for the inline "Generate this challenge"
  action on rows whose type is applicable but not yet generated (R2).
- `apps/web/app/repos/[owner]/[repo]/challenges/loading.tsx` — skeleton.
- `apps/web/app/repos/[owner]/[repo]/challenges/error.tsx` — error boundary
  (`load-failure` per Page Spec §11).
- `apps/web/app/repos/[owner]/[repo]/challenges/actions.ts` — the
  `generateForTypeAction` Server Action.

## Deviations from the Page Spec

1. **No type filter.** Page Spec §6 item 3 specifies an optional segmented
   control / `Select` for filtering by type, rendered only when ≥ 3
   applicable types exist. The shipped implementation **omits the filter
   entirely** — every applicable type renders as a row, and the
   `applicableChallengeTypes` set is small enough (six default + one
   broken-CI gated on R6 / M11) that filtering would be cosmetic. The
   filter can be added later without changing the data contract; the rows
   are already keyed by `type` so a client-side filter is a one-component
   addition. Acceptance-criterion impact: the spec marks the filter as
   *optional* (§6 item 3 — "Only renders when there are at least 3
   applicable types"), so this omission is within spec.
2. **"Generate this challenge" button is inline on every ungenerated row,
   rather than a row-as-link to a generation-triggering `/new` route.**
   Page Spec §8 leaves the exact route shape open ("the Detail Page is the
   one that triggers generation"); we chose the inline button to keep the
   Detail Page free of a "you arrived here without a `challengeId`" code
   path. The shipped behaviour is R2-compliant: opening a generated row
   reads the cached row; clicking "Generate this challenge" on an
   ungenerated row issues exactly one bounded SDK call and routes to the
   new challenge's URL.
3. **`targetFiles` for ungenerated rows is the first three M6 key-file
   paths.** Page Spec §5 ("`ChallengeListEntry` shape") describes the
   `targetFiles` for an "applicable, not yet generated" row as "the M6-
   map subset the generator will use." Since the generator picks the
   subset at SDK time and we cannot know it in advance, the shipped row
   names the first three key-file paths as a representative preview. The
   full M6-named path list is available on the Detail Page once the row
   is generated; the preview here is honest about being a sample.
4. **No "Based on the map of {owner}/{repo} →" link** (Page Spec §6 item 2)
   — the link is dropped to keep the header to one h1 + one
   description + one AI-generated label without adding a quiet secondary
   link. The same lineage is surfaced in the Detail Page (`sourceReferences`)
   and the M6 map can still be reached from the primary nav. Low impact.

## R-decisions honored verbatim

- **R1 / FR-2 — omit, don't fake.** The page only renders rows for types
  in `applicableChallengeTypes(projectMap)` — types that don't apply are
  not in the data and not in the UI.
- **R2 / FR-1 — lazy per type, cached per snapshot.** The list view never
  triggers SDK generation; the only mutating affordance is the inline
  "Generate this challenge" button on ungenerated rows.
- **R5 / R4 — latest 0–100 outcome per row.** Each generated row joins
  `getLatestChallengeOutcome` and surfaces the M8-shape score + band as
  the row's current status; the same `scoreBand` helper as M8 keeps
  labels identical (R4).
- **R6 — broken-CI gated.** Handled server-side inside
  `applicableChallengeTypes`; until M11 surfaces failing CI runs, the
  type is absent from the data and the row is absent from the UI.
- **R7 — no M10 rollup view.** No aggregate / cross-repo / cross-attempt
  surfaces are added.
- **R8 / FR-3 / US-1 — every target file is a real M6 path.** The list
  reads `inScopeFiles` from the persisted `Challenge` row (the
  integrity check #141 guaranteed those are M6-named at write time); the
  ungenerated-row preview reads from `projectMap.keyFileMap`.
- **FR-7 — explanation-only framing.** The list view itself does not
  carry FR-7 framing — that lives on the Detail Page (where it matters
  most, near the answer-entry form). The list's AI-generated label is
  the honest label per ADR 0005.

## Empty / error state coverage (Page Spec §10 / §11)

- **`not-imported`** — rendered with a primary "Import this repository"
  CTA to `/import`.
- **`no-project-map`** — rendered with a primary "Map this project" CTA
  to `/map/[owner]/[repo]`.
- **No applicable types** — rendered as a calm resting panel with a
  secondary "View project map" link.
- **`load-failure`** — covered by `error.tsx` with a "Try again" button.

## Test coverage

- `apps/web/lib/challenges.test.ts` covers the end-to-end happy path:
  list challenges → open a challenge → submit explanation → receive a
  0–100 score + weak-area → retry → see the new outcome surface as
  primary with the previous attempt visible in the collapsible panel.
