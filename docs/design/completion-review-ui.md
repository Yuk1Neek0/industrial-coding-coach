# Page Spec: Completion Review UI

Issue: #147 · Epic: `debug-expansion-challenge` · PRD: `.claude/prds/debug-expansion-challenge.md` (FR-5, FR-6, FR-7) · Sibling specs: `docs/design/debug-walkthrough-ui.md` (answer entry, #146), `docs/design/challenge-detail-page.md` (host, #145)

This spec defines the **Completion Review UI** for Milestone 9 — the surface
that renders the M9 grading-call output for a single `challenge_attempts` row:
the **0–100 score**, the **per-criterion results**, the **weak-area
breakdown** (matching M8 — R4), and a **short feedback paragraph** (FR-5). It
is the input to the Claude Design prompt
(`docs/design/ui-prompts/completion-review-ui.md`) and to the integration task
#148. It must be human-reviewed before the prompt is run. (UI tool: **Claude
Design — see ADR 0007 (`docs/decisions/0007-ui-generation-tool.md`)**.)

The Completion Review UI is the **graded-result surface** for an M9 challenge
attempt — the sibling of the **Debug Walkthrough UI**
(`docs/design/debug-walkthrough-ui.md`), which is the **answer-entry**
surface. The two together close M9's answer-and-score loop, in the same shape
as M8's Understanding Check UI (`docs/design/understanding-check.md`) +
Score / Weak Area UI (`docs/design/score-weak-area.md`) pair.

**The visual shape of this page mirrors M8's Score / Weak Area UI
(`docs/design/score-weak-area.md`)** — that is the R4 constraint, normative.
This spec does **not** redefine the score shape; it cites M8 by path and
reuses the same labels, grouping, and tone so a user who has used M8
recognises the grading shape immediately.

---

## 1. Page name

**Completion Review UI** — the result surface for a single M9 challenge
attempt: it presents the graded outcome of the user's free-text explanation
(plus illustrative snippets) of how they would tackle a project-tied
debug/extension challenge — a 0–100 score, a per-criterion result list, a
weak-area breakdown, and a short feedback paragraph.

## 2. User goal

> "I explained how I'd tackle this challenge in my own repo. Tell me how I
> did — a clear score, exactly which acceptance criteria I met and which I
> didn't, the topics I should revisit, and a short honest paragraph of
> feedback — so I can defend modifying this project in an interview."

The user reads their score, sees which acceptance criteria they hit and which
they missed, gets a named list of weak areas to study (matching M8's shape),
reads a short feedback paragraph, and — if they want — retries the same
challenge.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She
wants honest, actionable feedback on her own project — not a black-box grade
and not a "this passes" verdict on code that was never executed.

Design implications (carried over from M8's Score / Weak Area UI for shape
consistency, with M9-specific additions called out):

- **A guide, not a verdict.** Same tone as M8 — calm and encouraging, telling
  Mia where to put effort, never stamping pass/fail. No red "FAIL", no
  celebratory confetti.
- **Weak areas are the payoff.** Same as M8 — the named, actionable focus
  topics get first-class space, not a footnote.
- **Project-tied, not generic.** Every file/module reference shown in the
  review resolves to a real path in the M6 project map (FR-6 / R8); a
  reference that does not resolve is a bug (rejected by the integrity check
  before the result is ever persisted — task #141).
- **Honest about what was scored** *(M9-specific, FR-7).* The page is
  explicit, in plain prose, that **the score is over the user's explanation
  only** — not over executed code, not over snippet style, naming, or
  plausibility. **The page does not claim "this passes."** Snippets are
  illustrative; the score reflects whether the explanation fits the
  challenge's acceptance criteria and the M6 project map.
- **Per-criterion transparency** *(M9-specific, FR-5).* Each challenge has
  named acceptance criteria; the review shows each criterion's outcome
  plainly — passed / partially met / not met + a brief note — so Mia can
  see *which specific criterion* drove the score, not just the headline
  number.
- **Retry is an option** *(M9-specific, US-6).* After reading the review,
  Mia can retry the same challenge to submit a new attempt. Both attempts
  and grades persist; the most recent is the challenge's current outcome
  (per `docs/design/challenge-detail-page.md`, R5 / FR-10).

## 4. Route(s)

**The host route is owned by the Challenge Detail Page spec
(`docs/design/challenge-detail-page.md`, task #145)** — that spec resolves
whether the Completion Review UI sits **inline on the Challenge Detail
Page** or on its **own sub-route** under
`apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/...`. This spec
does not re-decide that placement; it requires the integrator (task #148)
to follow whichever resolution the Detail Page spec records.

What this spec does fix:

- **Read-only Server Component.** The Completion Review UI renders an
  already-stored `GradingResult` (the `challenge_attempts.grading` field
  from task #140's data-access layer) and is read-only. The single
  interactive affordance — the **"Retry this challenge"** action (§8) —
  is a small client island (a link / button) routed to the Debug
  Walkthrough UI (#146); it has no client state of its own.
- **Suggested home** (integrator's call, task #148):
  `apps/web/components/challenges/completion-review.tsx`.
- **Not rendered before grading exists.** On a fresh attempt where grading
  has not run yet, this component is **not rendered at all** — the parent
  surface shows the Debug Walkthrough UI's in-flight / pre-submit state
  instead.
- **Renders only integrity-checked outputs.** The component renders a
  `GradingResult` only after task #141's file-reference integrity check has
  accepted it. A grading output with an unresolved file/module reference is
  rejected at persistence time — it never reaches this component (R8 /
  FR-6).

## 5. Data source / contract

The component **receives the grading result and the active challenge as
props** — it does no fetching. Its parent (the Challenge Detail Page or its
review sub-route, per #145) loads the relevant `challenge_attempts` row plus
the active `Challenge` via the M9 data-access layer (task #140);
`ChallengeAttempt.grading` is what this component renders.

```ts
interface CompletionReviewProps {
  // Non-null by construction — the parent renders this component only when
  // the attempt has been graded (ChallengeAttempt.grading is present and has
  // passed the file-reference integrity check, task #141).
  grading: GradingResult
  // The active challenge — its acceptance criteria are echoed alongside the
  // per-criterion results, and its in-scope file/module set is the universe
  // of valid file references in this review.
  challenge: Challenge
  // For mapping a weak area / per-criterion result back to a real path,
  // sourced from the M6 project map for the snapshot. Every file reference
  // surfaced in §6 resolves to a path in this set (FR-6 / R8). Sourced from
  // the M6 project-map data-access layer; not redefined here.
  projectMapPaths: string[]
  // The route to return to for a new attempt — the Debug Walkthrough UI
  // host (US-6 / §8). The resolution lives in the Challenge Detail Page
  // spec (#145); the integrator wires this prop.
  retryHref: string
}
```

### `GradingResult` shape — the typed grading contract (shared with M8 — R4)

`GradingResult` is `ChallengeAttempt.grading`. **The grading shape, the pass
threshold, and the weak-area schema are shared with M8 (R4 — normative);
this spec does not redefine them.** The authoritative shape is
`docs/design/score-weak-area.md` §5 (`GradingResult`, `QuestionGrade`,
`WeakArea`); the exact TypeScript lives in `packages/db`. The structured
output of the M9 bounded **grading call** (task #143) — which scores the
user's `ChallengeAttempt` against the `Challenge`'s acceptance criteria and
the M6 project map — uses the same `GradingResult` shape.

The M9 grading call populates the shared M8 shape as follows — same fields,
M9-specific use:

| Field | Type | M9-specific use |
|---|---|---|
| `score` | `number` | overall score, **0–100** (R4) — §6a, the headline. Same pass threshold as M8. |
| `scoreLabel` | `string` | the same calm band labels as M8 ("Solid grasp" / "Getting there" / "Needs review") — §6a. |
| `summary` | `string` | the **short feedback paragraph** (FR-5) — one or two sentences of plain-language overall feedback. §6a. |
| `questionGrades` | `QuestionGrade[]` | the **per-criterion result list** (FR-5) — one entry per acceptance criterion of the challenge. See note below. §6b. |
| `weakAreas` | `WeakArea[]` | the **weak-area breakdown** (FR-5, R4 — M8 shape) — §6c. |
| `gradedAt` | `Date` | when grading ran — §6 header. |

**Per-criterion result reuses the M8 `QuestionGrade` shape (R4 — shared
schema).** In M8 a `QuestionGrade` is one row per comprehension question; in
M9 it is one row per **acceptance criterion** of the active challenge — the
same five fields (`questionId`, `questionPrompt`, `verdict`, `pointsAwarded`,
`pointsPossible`, `feedback`, `focusArea`) carry over, populated as:

- `questionId` — the acceptance criterion's id from the `Challenge`;
- `questionPrompt` — the acceptance criterion's prose (echoed so the user
  need not scroll back);
- `verdict` — `"correct" | "partial" | "incorrect" | "unanswered"`, mapped
  to *"met" / "partially met" / "not met" / "no attempt"* at the **label**
  level (the underlying enum is identical to M8 — R4); rendered with the
  same calm coloring as M8;
- `pointsAwarded` / `pointsPossible` — the criterion's contribution to the
  0–100 `score`;
- `feedback` — plain-language feedback on this criterion — what the user's
  explanation got right, what was missing, and a real file/module path from
  the M6 map where relevant;
- `focusArea` — the topic this criterion probed — ties to a `WeakArea`.

**`WeakArea` is reused verbatim from M8** (`docs/design/score-weak-area.md`
§5) — `area`, `explanation`, `suggestion`, `relatedQuestionIds`, `fileRefs`.
In M9, `fileRefs` are paths from the M6 project map for the snapshot; an
unresolved reference is impossible because the file-reference integrity
check (#141) rejects any grading output that names a file outside the M6
map before it is persisted (FR-6 / R8).

> **The answer-and-score loop closes here.** The Debug Walkthrough UI
> (`docs/design/debug-walkthrough-ui.md`) collects the user's free-text
> explanation and optional snippets; on submit, the bounded grading call
> (task #143) produces this `GradingResult`, the integrity check (#141)
> validates every file reference against the M6 project map, and on
> acceptance it is persisted to `challenge_attempts.grading`; this
> component renders it. The two specs together cover M9's answer-and-score
> loop end to end.

## 6. Page sections

The component is a single headed section ("Your result") on the Completion
Review surface — same heading and section pattern as M8's Score / Weak Area
UI (`docs/design/score-weak-area.md` §6) so users see one
comprehension-grading pattern across M8 and M9. Top to bottom:

1. **Result header** — heading "Your result" and a muted "Graded
   {gradedAt}" line. A short, honest note that the grade is AI-generated
   coaching feedback on the user's explanation (ADR 0005) — real text, not
   an icon-only signal. **Adjacent honesty line (FR-7, M9-specific):** a
   second short line states plainly that **scoring is over the user's
   explanation only; the page does not claim "this passes"** — the user's
   code was not executed, built, linted, or tested. Snippets are
   illustrative context and are not scored for style, naming, or
   plausibility. This framing is normative and must reach the user — it
   is not a tooltip or hover; it is real text in the header.

### 6a. Score summary

The headline outcome, prominent but **calm** — same shape as M8 §6a:

- the `score` shown clearly as a **0–100** value (R4), optionally with a
  quiet progress ring or bar (magnitude only — not a pass/fail color
  block);
- the `scoreLabel` band ("Solid grasp" / "Getting there" / "Needs review")
  beside it — **same labels as M8** (R4);
- the `summary` prose — the **short feedback paragraph** (FR-5), one or
  two encouraging, honest sentences.
- A small derived line is acceptable, e.g. "{n} of {m} acceptance criteria
  met", computed from `questionGrades`. (M8 uses "{n} of {m} questions
  answered well" — the M9 wording reflects the acceptance-criteria
  mapping; the pattern is identical.)

The framing throughout: this score shows *where to focus*, it is not a
verdict. Pass threshold is shared with M8 (R4) — this spec does not
redefine it.

### 6b. Per-criterion result list (FR-5)

`questionGrades` rendered as a list, **one row per acceptance criterion of
the active challenge** — same layout as M8 §6b. Each row shows:

- the criterion's prose (`questionPrompt`, echoed so the user need not
  scroll back to the Challenge Detail Page);
- a **verdict badge** — "Met" / "Partially met" / "Not met" / "No
  attempt" — calm coloring, meaning carried by the text (the underlying
  enum is M8's `"correct" | "partial" | "incorrect" | "unanswered"` —
  R4);
- the `pointsAwarded` / `pointsPossible` (e.g. "2 / 3 points");
- the `feedback` prose — what the explanation got right, what was
  missing; **every file/module path named in this prose resolves to a
  real M6 project-map path (FR-6 / R8)**, rendered as a monospace chip
  with an in-page anchor to the file's entry in the Challenge Detail
  Page's in-scope file/module set (#145);
- a small `focusArea` tag linking the criterion to its weak area in §6c.

This breakdown may be a list of `Card`s or a `Collapsible` per criterion
(matching M8); the feedback prose, however, must be visible by default —
it is the point. **Renders only integrity-checked output** — see §4: any
`feedback` file reference outside the M6 map is rejected by task #141
before persistence.

### 6c. Weak-area breakdown — the actionable payoff (R4, M8 shape)

`weakAreas` rendered as a clearly headed sub-section ("Areas to focus on"),
one **weak-area block** per `WeakArea` — **the labels, grouping, and
layout are identical to M8's `docs/design/score-weak-area.md` §6c** (R4).
Each block shows, exactly as in M8:

- the `area` name as the block heading;
- the `explanation` prose — why this is a gap;
- the `suggestion` prose, framed "What to do next" — the concrete next
  step;
- the `relatedQuestionIds` surfaced as small links/anchors to the matching
  rows in §6b ("From criterion 2, 4");
- when `fileRefs` is non-empty, the file path(s) as monospace chips —
  each chip is an in-page anchor to the matching file in the Challenge
  Detail Page's in-scope set (#145). **Every chip's path resolves to a
  real M6 project-map path (FR-6 / R8)** — guaranteed by the integrity
  check (#141); the page renders no chip whose path is outside the M6
  map.

Weak-area blocks are the most actionable content on the result — give them
generous space; they must be plainly visible, **never collapsed by
default** (matching M8).

If `weakAreas` is empty, §6c shows a calm, encouraging message instead —
see §10.

### 6d. Retry affordance (US-6 — M9-specific)

A clearly labelled action **"Retry this challenge"**, rendered at the
bottom of the result (below §6c), returns the user to the **Debug
Walkthrough UI** (`docs/design/debug-walkthrough-ui.md`, #146) so they can
submit a new attempt against the same challenge.

- The affordance navigates to the `retryHref` prop (resolved by the
  Challenge Detail Page spec, #145) — the integrator wires it; this spec
  does not redefine the route.
- A short helper line accompanies the button: "Submitting a new attempt
  keeps this one in your history — your latest outcome becomes the
  challenge's current status." This reflects R5 / FR-10 (history persists,
  latest is primary).
- The control is calm, secondary — it is not the page's primary call to
  action (the *content* is). It is a single button or button-styled link,
  not a multi-step flow.
- Keyboard-operable with a visible focus ring; the accessible name
  includes the target ("Retry this challenge — return to the walkthrough
  to submit a new attempt").

The retry affordance is **always rendered**, regardless of `score` — the
M9 surface deliberately does not gate retry on a pass/fail threshold (see
§3, FR-7).

## 7. Input fields

The Completion Review UI has **no input fields** — it is a read-only
presentation of a stored, integrity-checked result. The one interactive
affordance is the §6d "Retry this challenge" navigation, which collects no
user input on this page — it routes to the Debug Walkthrough UI (#146) for
a new attempt.

## 8. Primary actions

- **Read the result** — the score, the per-criterion result list, the weak
  areas, and the short feedback paragraph. The main action.
- **Jump to a related criterion** — from a weak-area block to its
  `relatedQuestionIds` rows in §6b. An in-page anchor.
- **Jump to a related file/module** — from a per-criterion `feedback` chip
  or a weak-area `fileRefs` chip to that file's entry in the Challenge
  Detail Page's in-scope set (#145). An in-page anchor.
- **Retry this challenge** (§6d, US-6) — the single navigation action;
  returns to the Debug Walkthrough UI (#146) for a new attempt. Both
  attempts and both grades persist (R5 / FR-10).

No create/edit/delete on the grading result — once stored and
integrity-checked, the `GradingResult` is immutable; a retry produces a
**new** `challenge_attempts` row with its own grading, it does not edit
this one.

## 9. Loading state

The component does **not** own a loading state. Its parent (the Challenge
Detail Page or its review sub-route, per #145) renders the route skeleton;
the few-second grading call's in-progress state belongs to the Debug
Walkthrough UI (`docs/design/debug-walkthrough-ui.md`). By the time this
component renders, `grading` is already loaded, integrity-checked, and
passed in as a prop.

## 10. Empty state

This component renders **only when a graded, integrity-checked result
exists** — so there is no "no result" state; an attempt that has not yet
been graded simply does not render this component. The Debug Walkthrough
UI's pre-submit / in-flight state shows instead.

The one within-component partial state is an **empty `weakAreas` array**
— the user's explanation covered the challenge well enough that grading
flagged no focus topics. In that case §6c shows a calm, encouraging
message (matching M8 §10): heading "No specific weak areas — nice work"
and a short line ("Your explanation covered the challenge well. Re-read
the per-criterion feedback above for any small refinements."). The score
summary, the per-criterion list, the feedback paragraph, and the §6d
retry affordance all still render fully.

## 11. Error state

The component does not fetch, so it has **no error state of its own**. A
failure to load the `ChallengeAttempt` is handled by the host route's
`error.tsx` boundary (per #145); a failure of the **grading call** itself
is handled inside the Debug Walkthrough UI (`docs/design/debug-walkthrough-ui.md`)
— by the time this component renders, grading has succeeded and the
integrity check has accepted the result.

There is **no defensive "unresolved file reference" state** in M9 — unlike
M8, M9 has a file-reference integrity check (task #141) that rejects any
grading output whose file references fall outside the M6 project map
before the row is persisted (FR-6 / R8). The component therefore renders
every file/module reference as a real, resolvable in-page anchor; the
defensive plain-text fallback that M8's `score-weak-area.md` §11 describes
is not reachable here.

## 12. Success state

- The component renders the score summary (score 0–100, label, summary
  prose), the per-criterion result list (every `questionGrade` with its
  verdict, points, and feedback), and the weak-area breakdown (every
  `WeakArea` with its explanation, suggestion, related criteria, and
  file references) — every field of §5 has a home in the layout.
- The honesty line in §6 is rendered as real text — **the page does not
  claim "this passes"** (FR-7).
- Every file/module reference resolves to a real M6 project-map path
  (FR-6 / R8); chips are working in-page anchors (no plain-text
  fallback in M9 — see §11).
- When `weakAreas` is empty, §6c shows the calm "no specific weak areas"
  message instead of a bare heading.
- The "Retry this challenge" affordance is present and routes to the
  Debug Walkthrough UI (#146) for a new attempt (US-6).
- This component appearing **is** the success state of M9's
  answer-and-score loop — there is no separate toast; the score, the
  per-criterion results, the weak areas, and the short feedback paragraph
  are the confirmation that the loop completed.

## 13. Accessibility notes

(Closely mirrors `docs/design/score-weak-area.md` §13 — same shape as M8
so the M9 result reads as one product with M8.)

- **Semantics & headings.** The section has one heading ("Your result")
  at the level the host route assigns it (an `<h2>`); the score summary,
  per-criterion result list, weak-area breakdown, and retry affordance
  are `<h3>` sub-sections (the retry block uses an `<h3>` even when
  visually compact, so the section structure is readable), with no
  skipped levels. The per-criterion list and the weak-area list are
  `<ul>`s.
- **Score not color-only.** The score and `scoreLabel` are conveyed by
  text and number — a progress ring/bar is supportive only; meaning never
  rests on color alone. A low score is not signalled by red alone.
- **Verdict badges.** "Met" / "Partially met" / "Not met" / "No attempt"
  badges convey meaning by their text label; color is supportive and
  AA-contrast in both themes.
- **AI-generated label and FR-7 honesty line.** Both are real, announced
  text — not color-only or icon-only signals. The FR-7 honesty line ("the
  page does not claim 'this passes' …") is part of the header content,
  not a tooltip.
- **In-page anchors.** Related-criterion and file-reference anchors have
  accessible names that include their target ("Jump to criterion 2",
  "Jump to file `src/auth/rate-limit.ts` in the in-scope set");
  keyboard-operable with a visible focus ring.
- **Retry affordance.** The "Retry this challenge" control is reachable
  in logical order, keyboard-activated (Enter / Space), and its
  accessible name names the target ("Retry this challenge — return to
  the walkthrough to submit a new attempt").
- **Reading order.** DOM order = visual order: header → score summary
  → per-criterion result list → weak areas → retry. Logical for a screen
  reader top to bottom.
- **States announced.** The empty-`weakAreas` message is real text
  content, not a color-only signal.
- **Keyboard.** Every in-page anchor and the retry control are reachable
  in logical order; Enter activates. Visible focus ring throughout.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes
  (the app uses `next-themes`).
- **Targets.** Anchor links and the retry button are comfortably sized
  for pointer and touch.

## 14. Acceptance criteria

- [ ] The component renders the **score** as a clear 0–100 value (R4)
      with its `scoreLabel` band and `summary` prose — calm and
      encouraging, not a pass/fail verdict. Pass threshold and labels are
      shared with M8 (`docs/design/score-weak-area.md` §6a — R4).
- [ ] The **per-criterion result list** (FR-5) renders every
      `questionGrade` with its echoed prompt, a `verdict` badge
      ("Met" / "Partially met" / "Not met" / "No attempt"), the points
      awarded/possible, and the feedback prose.
- [ ] The **weak-area breakdown** renders every `WeakArea` with its
      `area`, `explanation`, `suggestion`, related-criterion links, and
      any `fileRefs` as in-page anchor chips — **labels, grouping, and
      layout identical to M8's `docs/design/score-weak-area.md` §6c**
      (R4). Plainly visible, never collapsed by default.
- [ ] The **short feedback paragraph** (FR-5) is rendered as the
      `summary` prose in §6a — one or two sentences, plain language.
- [ ] **Every file/module reference resolves to a real M6 project-map
      path** (FR-6 / R8) — guaranteed by the file-reference integrity
      check (task #141); the page renders only integrity-checked
      output.
- [ ] The page is **explicit, in real header text, that scoring is over
      the user's explanation only and that the page does not claim
      "this passes"** (FR-7).
- [ ] The **"Retry this challenge" affordance** (US-6) is present,
      routes to the Debug Walkthrough UI
      (`docs/design/debug-walkthrough-ui.md`, #146), and is
      keyboard-accessible. Both attempts and grades persist (R5 / FR-10).
- [ ] The component renders **only when `ChallengeAttempt.grading` is
      non-null and integrity-checked** — it receives `grading`,
      `challenge`, `projectMapPaths`, and `retryHref` as props and does
      **no** data fetching.
- [ ] The component reads as one product with the rest of M9 and
      visually mirrors M8's Score / Weak Area UI
      (`docs/design/score-weak-area.md`) — shared components, spacing,
      tone, and labels.
- [ ] Accessibility notes in §13 are satisfied (heading order,
      score/verdict not color-only, AI-generated label and FR-7 honesty
      line as real text, accessible in-page anchors and retry button,
      AA contrast).
- [ ] **Claude Design (ADR 0007 —
      `docs/decisions/0007-ui-generation-tool.md`) is the UI generation
      tool.**
- [ ] Page spec is human-reviewed before the Claude Design prompt is
      used (Definition of Done, task #147).
