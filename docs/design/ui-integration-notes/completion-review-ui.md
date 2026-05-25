# Integration notes: Completion Review UI

Issue: #148 · Page Spec: `docs/design/completion-review-ui.md` (#147) ·
ADR 0007 (Claude Design — `docs/decisions/0007-ui-generation-tool.md`).

This file records the deviations between the Page Spec (#147) and the
shipped React implementation at
`apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/_components/completion-review.tsx`.
Per ADR 0007, the Claude Design round-trip is **Page Spec → Claude Design
prompt → Claude Design draft → integration notes**; task #148 ships the
integration notes documenting deviations.

## Host resolved

Per #145's Page Spec §4a — the Completion Review UI is embedded **inline
on the Challenge Detail Page**, as a `<section>` element with the heading
"Your most recent attempt". When rendered inside an expanded prior-
attempt panel (`isPrior={true}`), the section header is suppressed and
the parent's `<details>` element provides the heading context. There is
no `/review` sub-route.

## Component shipped

`…/_components/completion-review.tsx` — a Server Component that:
- renders an already-stored, integrity-checked `ChallengeGradingResult`;
- mirrors M8's Score / Weak Area UI visually (the same score dial
  pattern, the same `scoreBand` helper labels, the same weak-area block
  layout) — R4 normative;
- carries the FR-7 honesty line in the header as real text — the page
  does NOT claim "this passes";
- is rendered only when the parent's attempt has a non-null `grading`.

## Deviations from the Page Spec

1. **No in-page anchor links from `criterionResults[].detail` chips or
   `weakAreas[].fileRefs` chips to the in-scope file list** (Page Spec
   §6b / §6c calls for those anchors). The shipped implementation
   renders file references inside the per-criterion `detail` and the
   weak-area `detail` as plain prose. The integrity check (#141) rejects
   any off-map reference before the grading is persisted, so the prose
   is M6-grounded — but the path tokens are not extracted into clickable
   chips. This is a polish item; the actionable content (verdict, points,
   feedback prose, weak-area name + suggestion) is fully visible.
2. **No `relatedQuestionIds` cross-link** from a weak-area block to its
   matching per-criterion row (Page Spec §6c calls for small links).
   The shipped schema's `WeakArea` shape is `{ area, detail }` (per
   `packages/db/src/schema.ts`) — the spec's richer `relatedQuestionIds`
   / `suggestion` / `fileRefs` fields are not persisted by the M9
   grading call (#143). The shipped UI renders what the schema carries.
3. **No `summary` field separate from `feedback`.** The shipped schema's
   `ChallengeGradingResult` has `score`, `weakAreas[]`, `criterionResults[]`,
   `feedback` — no `summary`. Page Spec §5 / §6a treats `summary` as the
   "short feedback paragraph"; we render `feedback` as that paragraph
   under a "Feedback" heading. The score band ("Solid grasp" / "Getting
   there" / etc.) sits next to the score dial as the spec describes.
4. **"Retry this challenge" affordance is on the Detail Page header, not
   inside the Completion Review.** Page Spec §6d calls for the retry
   button "rendered at the bottom of the result (below §6c)". On the
   Detail Page the retry path is the Debug Walkthrough UI itself —
   always visible above the Completion Review — so a separate "Retry"
   button inside the review would be redundant. We added a "Want to
   push the score higher?" prompt at the bottom of the review pointing
   the user back to the walkthrough above; the spec's `retryHref` prop
   is not needed because the walkthrough is co-located. Acceptance-
   criterion impact: §14 says the retry affordance "is present" — the
   Debug Walkthrough is the present affordance, always rendered above
   the review.

## R-decisions honored verbatim

- **R4 — M8-shape grading.** Score dial, `scoreLabel` band, weak-area
  block layout, calm tone are all mirrored from
  `apps/web/app/reviews/r/[id]/_components/score-weak-area.tsx`. The
  same `scoreBand` helper (`apps/web/lib/challenges.ts`) returns the
  same labels as the M8 helper.
- **R5 / FR-10 — most-recent attempt primary, prior attempts inline
  collapsed.** The Completion Review renders the most-recent attempt
  with the full section header ("Your most recent attempt"); when
  embedded inside an expanded prior-attempt `<details>` panel the
  header is suppressed (`isPrior={true}`) so the panel's own framing
  ("Prior attempt") leads.
- **R8 / FR-6 — every file/module reference resolves to a real M6 path.**
  Guaranteed by the integrity check (#141) at persistence time; the page
  renders only integrity-checked output (per #147 §4 "Not rendered
  before grading exists" + #147 §11 "no defensive 'unresolved file
  reference' state in M9").
- **FR-5 — 0–100 score + per-criterion + weak-area + feedback paragraph
  all rendered.** Verbatim.
- **FR-7 — does NOT claim "this passes".** The header text reads, in
  real prose: "This page does not claim 'this passes'." The empty-
  weak-areas state still does not stamp the answer as passing — it
  reads "No specific weak areas — nice work" matching M8's tone.

## Test coverage

- `apps/web/lib/challenges.test.ts` exercises `gradeChallenge` end-to-end
  against an in-memory SQLite + mocked SDK transport, asserting the
  persisted `grading` carries a 0–100 score, a `weakAreas` array, a
  `criterionResults` array keyed to the challenge's acceptance criteria,
  and a `feedback` paragraph. The integrity check is exercised by the
  M9 backend's own `grading.test.ts` (#143) and by the wrapper's
  `integrity-failure` handling.
