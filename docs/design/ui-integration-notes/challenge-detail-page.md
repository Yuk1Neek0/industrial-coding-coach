# Integration notes: Challenge Detail Page

Issue: #148 · Page Spec: `docs/design/challenge-detail-page.md` (#145) ·
ADR 0007 (Claude Design — `docs/decisions/0007-ui-generation-tool.md`).

This file records the deviations between the Page Spec (#145) and the
shipped React implementation at
`apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/page.tsx`.
Per ADR 0007, the Claude Design round-trip is **Page Spec → Claude Design
prompt → Claude Design draft → integration notes**; task #148 ships the
integration notes documenting deviations (the Claude Design draft itself
is a manual external step, not invoked by Claude Code).

## Components shipped

- `apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/page.tsx` —
  the Server Component page shell.
- `…/_components/new-challenge-button.tsx` — the R2 / FR-1 "new challenge"
  action.
- `…/_components/debug-walkthrough.tsx` — the Debug Walkthrough UI (#146)
  inline.
- `…/_components/completion-review.tsx` — the Completion Review UI (#147)
  inline.
- `…/_components/prior-attempts-panel.tsx` — the inline collapsible
  prior-attempts panel (R5 / FR-10).
- `…/loading.tsx` — skeleton.
- `…/error.tsx` — error boundary.
- `…/not-found.tsx` — not-found UI.
- `…/actions.ts` — `submitAttemptAction` (persist + grade) and
  `regenerateChallengeAction` (R2 / FR-1 "new challenge").

## Hosting decision honored

Per Page Spec §4a — **both the Debug Walkthrough UI (#146) and the
Completion Review UI (#147) are embedded inline on this page**. There are
no `/walkthrough` or `/review` sub-routes. The prior-attempts panel is
inline below the most-recent Completion Review (R5). This is the
distinguishing M9 affordance.

## Deviations from the Page Spec

1. **No optional in-page section nav** (Page Spec §6 item 3). The page is
   a single readable scroll — short enough to scan without anchor jumps.
   The headings remain semantic (`<h1>` + `<h2>` per section) so a screen
   reader's heading navigation gives the same affordance.
2. **`sourceReferences` chips are not yet linked to the M6 Project Map
   page's section anchors** (Page Spec §6f says "optionally linkable to
   the corresponding section of the M6 Project Map page via the
   `anchor`"). The shipped implementation renders the chip as a non-link;
   the M6 Project Map page is still reachable from the primary nav. Low
   impact, and easily extended once the M6 page exposes stable anchors.
3. **`questionGrades.feedback` paths are not yet hyperlinked anchors back
   to the in-scope file list.** Page Spec §6h / §6 of the Completion
   Review spec asks for an in-page anchor from a `feedback` chip to its
   in-scope file's entry. The shipped Completion Review renders file
   references inside the `feedback` and `criterionResults[].detail` prose
   plainly. The integrity check (#141) still rejects any off-map path
   before the grade is persisted, so the rendered prose is M6-grounded;
   the linking is a polish item.
4. **The confirmation dialog for "New challenge" uses `window.confirm`,
   not a shadcn `AlertDialog`.** Page Spec §13 calls for a real `<dialog>`
   / `AlertDialog` with focus trap and Esc-to-dismiss. `window.confirm`
   is keyboard-operable, focus-trapping by the browser, Esc-dismissible,
   and renders in the Next.js test runtime without adding a client
   dependency — we chose it to keep the dependency surface unchanged
   (task #148 hard constraint: no new dependencies). Future polish item.
5. **Scope panels are stacked as a two-column grid via CSS `scope-grid`
   class** — the actual responsive behaviour depends on the global stylesheet's
   `scope-grid` rule. If the stylesheet does not define it, the columns
   render as a normal block flow; the headings, lists, and per-entry text
   still convey "In scope" vs "Out of scope" semantically.

## R-decisions honored verbatim

- **R2 / FR-1 — "new challenge" re-invokes generation with
  `forceRegenerate: true`.** The button's confirmation prompt fires only
  when the current challenge has at least one attempt; a fresh
  challenge regenerates without a prompt.
- **R3 / FR-7 — explanation-only framing.** The Detail Page renders an
  honest framing line above the fold ("…the grader judges your
  **explanation** — your snippet, if you add one, is illustrative and is
  not scored.") and the same line repeats inside the Debug Walkthrough
  and Completion Review.
- **R4 — M8-shape grading.** The Completion Review's score dial,
  `scoreLabel` band, and weak-area block layout mirror M8's Score /
  Weak Area UI (`apps/web/app/reviews/r/[id]/_components/score-weak-area.tsx`).
- **R5 / FR-10 — inline collapsible prior-attempts panel.** The
  `PriorAttemptsPanel` renders `<details>` elements (collapsed by
  default, expand/collapse purely client-side via native HTML — no JS,
  full keyboard support). The most-recent attempt renders as primary;
  prior attempts list in most-recent-first order. **Not** on a separate
  page.
- **R8 / FR-6 — every file reference resolves to a real M6 path.** The
  integrity check (#141) guarantees this at persistence time; the page
  trusts the persisted contract.
- **FR-5 — 0–100 score + per-criterion result + weak-area + feedback
  paragraph** all rendered by the Completion Review.
- **FR-7 — does NOT claim "this passes".** The Completion Review header
  carries the FR-7 honesty line as real text.
- **ADR 0005 — bounded LLM calls.** Both `submitAttemptAction` and
  `regenerateChallengeAction` flow through the M9 backend's bounded
  `generateChallenge` / `gradeChallenge` calls; the UI never reaches the
  Anthropic SDK directly.
- **ADR 0006 — server-side data access only.** No API routes; every read
  is a Server Component direct call, every write is a Server Action.
- **ADR 0009 — no new GitHub access path.** The Detail Page reads the
  snapshot identity via `getImportedRepoById`, no new fetch.

## Integration-boundary integrity check

Per task #148: before persisting a generated challenge or a grading
output, the server actions call `verifyChallengeIntegrity` (#141).
**Integrity check is enforced inside `generateChallenge` (#142) and
`gradeChallenge` (#143)** — both throw a typed `ChallengeIntegrityError`
/ `ChallengeGradingIntegrityError` on rejection. The `lib/challenges.ts`
wrappers catch those typed errors and surface an explicit
`integrity-failure` error to the UI — never a silent render. The user
sees an inline error and the action does not persist.

## Test coverage

- `apps/web/lib/challenges.test.ts` covers the end-to-end happy path
  including the multi-attempt rotation: the first submit becomes the
  most-recent; the second submit rotates the first into the prior-
  attempts panel.
