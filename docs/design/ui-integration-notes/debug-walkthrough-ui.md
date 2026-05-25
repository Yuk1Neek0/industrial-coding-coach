# Integration notes: Debug Walkthrough UI

Issue: #148 · Page Spec: `docs/design/debug-walkthrough-ui.md` (#146) ·
ADR 0007 (Claude Design — `docs/decisions/0007-ui-generation-tool.md`).

This file records the deviations between the Page Spec (#146) and the
shipped React implementation at
`apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/_components/debug-walkthrough.tsx`.
Per ADR 0007, the Claude Design round-trip is **Page Spec → Claude Design
prompt → Claude Design draft → integration notes**; task #148 ships the
integration notes documenting deviations.

## Host resolved

Per #145's Page Spec §4a — the Debug Walkthrough UI is embedded **inline
on the Challenge Detail Page**, as a `<section>` element with the heading
"Your walkthrough". There is no `/walkthrough` sub-route. This component
is a Client Component island; the submit goes through the
`submitAttemptAction` Server Action, which runs the bounded grading SDK
call server-side (`lib/challenges.ts`).

## Component shipped

`…/_components/debug-walkthrough.tsx` — a Client Component that:
- displays the active challenge's scope (in-scope, out-of-scope,
  acceptance criteria) inside an expandable reference panel (open by
  default) above the inputs;
- holds local state for `explanation`, `filePaths`, and `snippets`;
- restricts every file-path input to the snapshot's M6 project-map-named
  set (R8 normative — no free-typed paths);
- submits through `submitAttemptAction` and refreshes the route so the
  Completion Review UI and prior-attempts panel render against the fresh
  state.

## Deviations from the Page Spec

1. **The file-paths picker is an HTML `<select>`, not a full WAI-ARIA
   combobox.** Page Spec §6.4 / §13 calls for `role="combobox"` semantics
   with `aria-expanded`, `aria-controls`, and a labelled listbox.
   `<select>` is a native combobox by accessibility tree — keyboard-
   operable, screen-reader-announced, type-ahead-filterable. It does
   **not** support multi-select in one keystroke and does **not** filter
   the visible list as the user types beyond the browser's native behaviour.
   We chose `<select>` for two reasons:
   - **R8 is satisfied by construction:** the candidate list is the M6-
     mapped set; the `<select>` cannot accept a free-typed path. The
     restricted-picker invariant holds.
   - **No new dependencies:** task #148 hard constraint prevents adding a
     combobox library. shadcn's combobox primitive is not yet wired into
     `packages/ui`.
   The picked-paths list renders below the `<select>` as a `<ul>` of
   `file-card` rows, each with a labelled "Remove" button — that part of
   the spec is satisfied verbatim.
2. **The snippets section is not strictly collapsed by default with a
   "+ Add a snippet" button** (Page Spec §6.5). Instead, the section
   heading + the "Snippets are illustrative — not graded" framing is
   always visible (as plain text — FR-7), and the "+ Add a snippet"
   button is rendered in the header. The list of snippet rows is hidden
   until the user clicks "+ Add a snippet" (or pre-populated from a prior
   attempt). This puts the FR-7 framing above the fold so the user can't
   miss it even before deciding to add a snippet — slightly more visible
   than the spec's "collapsed by default" because R3 / FR-7 is the most
   important constraint of this UI.
3. **No `<fieldset>` for the explanation `<textarea>`.** Page Spec §6.3
   calls for a `<label>` association; the shipped implementation uses
   `<label htmlFor="…">` + `<textarea id="…">`. Snippets do use a
   `<fieldset>` + `<legend>` as the spec asks (§13).
4. **No soft character counter under the explanation** (spec §6.3
   mentions one as optional). Omitted to keep the UI calm.
5. **Inline "in scope" / "out of scope" badges on picked-path chips** —
   shipped verbatim. The badge text carries meaning, not color alone
   (spec §13).

## R-decisions honored verbatim

- **R3 / FR-7 — explanation-only grading.** Three places carry the
  framing: (a) the Detail Page's honest framing line above the fold,
  (b) the section intro at the top of "Your walkthrough", and (c) the
  inline note inside the snippets section ("Snippets are illustrative —
  they are not scored…"). All three are real, persistent body text —
  not tooltips, not icons.
- **R8 / FR-4 — file-paths picker restricted to M6 paths.** Every input
  that accepts a path is a `<select>` over the M6-named candidate list;
  no free-typed paths are representable in this UI. The candidate list
  is the union of in-scope, out-of-scope, and source-reference paths
  (plus the full M6 `keyFileMap`), passed in as `mapPaths`.
- **US-3 — attempts persist.** `submitAttemptAction` calls
  `submitChallengeAttempt` → `createChallengeAttempt` (#140's DAL) →
  `gradeChallenge` (#143). The attempt row is created before the
  grading call runs, so a grading failure does not lose the user's
  work.
- **US-6 — multiple attempts, retry.** The form pre-populates from the
  most-recent attempt; a new submit creates a new attempt row (it does
  not overwrite the prior). Both attempts are visible after the submit:
  the new one becomes the most-recent (Completion Review), the prior
  rotates into the collapsible panel.
- **Submit failure preserves work.** A `{ ok: false }` from the action
  shows a calm inline "Try again" without clearing `explanation`,
  `filePaths`, or `snippets`.
- **ADR 0006 — server-side data access only.** Submit goes through a
  Server Action; no API route is added.

## Test coverage

- `apps/web/lib/challenges.test.ts` exercises `submitChallengeAttempt`
  end-to-end against an in-memory SQLite + mocked SDK transport, asserting:
  the attempt persists, the grading result populates, the latest-
  outcome accessor returns the just-submitted attempt, and a second
  submit rotates the prior into the history.
