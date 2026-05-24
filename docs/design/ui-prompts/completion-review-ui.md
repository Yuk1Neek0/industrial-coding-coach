# Claude Design Prompt: Completion Review UI

Issue: #147 · Epic: `debug-expansion-challenge` · Tool: **Claude Design** (ADR 0007 — `docs/decisions/0007-ui-generation-tool.md`)

UI-generation prompt for the **Completion Review UI** — the M9
graded-result surface for a single project-tied debug/extension challenge
attempt. Full contract: the page spec `docs/design/completion-review-ui.md`
— read that for the complete behaviour. This component is the
**graded-result** half of M9's answer-and-score loop; its sibling, the
**Debug Walkthrough UI** (`docs/design/ui-prompts/debug-walkthrough-ui.md`),
is the answer-entry half.

**The visual shape of this component mirrors M8's Score / Weak Area UI
(`docs/design/score-weak-area.md`, prompt
`docs/design/ui-prompts/score-weak-area.md`)** — that is the R4 constraint,
normative. The Claude Design output must reuse the same labels, grouping,
spacing, and tone so a user who has used M8 recognises the grading shape
immediately. The grading shape (`GradingResult`, `QuestionGrade`,
`WeakArea`) is shared with M8 — do not redefine it.

## How to use this (Claude Design)

1. In Claude Design, **create a project** (or continue the
   `debug-expansion-challenge` project) and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling.
2. Optionally attach the page spec `docs/design/completion-review-ui.md`
   and the M8 spec `docs/design/score-weak-area.md` as context so the
   output mirrors M8's shape.
3. Paste the prompt below. Iterate on the canvas with chat + inline
   comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` /
   standalone HTML) and return it here.

The output is a **draft component**. Integration task **#148** reconciles
it with `apps/web` + `packages/ui` and wires it to the real
`ChallengeAttempt.grading` data via the M9 data-access layer (task #140)
— rendering only outputs that have passed the file-reference integrity
check (task #141).

**Stack to target:** Next.js App Router, React Server Components,
TypeScript, Tailwind CSS, shadcn/ui. Light + dark mode. Build with
mock/sample data only — no data fetching.

---

## Prompt — paste into Claude Design

Build a **Completion Review** result component for a learning-coach web
app, using React, TypeScript, Tailwind CSS, and shadcn/ui. It is **not a
page** — it is a result section shown after a user submits an explanation
of how they would tackle a project-tied debug/extension challenge in their
own imported repository. Light and dark mode. Use only mock sample data
passed in as a prop — no data fetching.

### Visual reference (important)

The visual shape of this component **mirrors a sibling component** from
the same product — the **Score / Weak Area UI** (a graded-result section
already shipped). Match its layout, labels, spacing, and tone closely so
the two read as one product. Specifically: same single-section heading
("Your result"), same calm "AI-generated coaching feedback" framing in
the header, same score-summary block (numeric score + calm band label +
summary prose), same per-row breakdown structure, same weak-area block
pattern. Differences are called out explicitly below.

### Domain

The app coaches a job-seeking junior developer to genuinely understand a
project they built with AI assistance. After the user **explains in plain
language** how they would tackle a debug/extension challenge on their own
repository — *which files they would change and why*, optionally with a
small illustrative code snippet — their explanation is graded. This
component presents that result.

**Crucial framing (do not soften):**

- The grade is **AI-generated coaching feedback** on the user's
  **explanation only**. The user's code was **not executed, built,
  linted, or tested**. Snippets are illustrative — they are **not** scored
  for style, naming, or plausibility.
- **The component does not claim "this passes."** No "PASS / FAIL"
  stamp, no green-tick verdict, no confetti, no red "FAIL". The tone is
  **a guide, not a verdict** — calm and encouraging, telling the user
  where to focus.
- The **weak areas are the actionable payoff** — they get first-class
  space.
- **Every file/module path** shown in the review is a real path from the
  user's repository project map — render them as monospace chips with
  in-page anchors. (In the mock data, treat the paths as if they were
  guaranteed real; in production they are validated by an upstream
  integrity check.)

### Typed grading shape (shared with the sibling M8 surface)

The component takes a `grading` object with these fields (this is the
**same typed shape** as the sibling M8 Score / Weak Area component — do
not redefine it):

- `score` — a number, **0–100**
- `scoreLabel` — a short calm band label, one of "Solid grasp", "Getting
  there", "Needs review" (the same labels used by the sibling M8
  surface — do not invent new bands)
- `summary` — one or two sentences of plain-language overall feedback
  (this is the **short feedback paragraph**)
- `questionGrades` — array of `{ questionId, questionPrompt, verdict,
  pointsAwarded, pointsPossible, feedback, focusArea }`; `verdict` is
  `"correct" | "partial" | "incorrect" | "unanswered"`. **In this
  component, each entry is one acceptance criterion of the active
  challenge** (not one comprehension question as in the M8 surface);
  render the verdict label as **"Met" / "Partially met" / "Not met" /
  "No attempt"** respectively. The underlying enum is unchanged from
  M8.
- `weakAreas` — array of `{ area, explanation, suggestion,
  relatedQuestionIds, fileRefs }` (the M8 `WeakArea` shape, used
  verbatim)
- `gradedAt` — a timestamp

It also receives:

- `challenge` — `{ id, type, taskDescription, acceptanceCriteria: { id,
  prose }[], inScopeFilePaths: string[], outOfScopeFilePaths: string[] }`
  — used only to echo the criterion prose and to anchor file references
  back to the in-scope set on the parent page.
- `projectMapPaths: string[]` — the universe of valid file paths
  (sourced upstream from the user's project map). Every chip's path is
  in this set; you may treat any unmapped path as a bug (do not render
  a "broken link" fallback — assume the data is clean).
- `retryHref: string` — the URL for the **"Retry this challenge"**
  action (see Component layout §5).

Seed the mock data with a realistic result for a plausible challenge —
e.g. challenge type **"Add a small field"**, task description **"Add an
optional `lastLoginAt: Date` field to the `User` model and surface it on
the profile page."** Use:

- a `score` around **68/100**, `scoreLabel` "Getting there", a
  `summary` of one or two encouraging-but-honest sentences;
- **4–5 acceptance criteria** in `challenge.acceptanceCriteria`, with
  realistic prose like "Names the schema file where `User` is defined",
  "Identifies the migration step required", "Names the profile-page
  component the field should appear on", "Acknowledges the API response
  shape change";
- **4–5 `questionGrades`** (one per criterion) with a mix of verdicts —
  at least one `"partial"` and one `"incorrect"`;
- **2–3 `weakAreas`** with concrete explanations, suggestions, related
  criterion ids, and file paths like
  `packages/db/src/schema/user.ts`, `apps/web/app/profile/page.tsx`,
  `packages/db/src/migrations/20260524-add-last-login.ts`;
- `challenge.inScopeFilePaths` listing those file paths and a couple
  more from the same area; `outOfScopeFilePaths` listing 2–3 paths the
  user should **not** touch.

No "lorem ipsum".

### Component layout

A single headed section "Your result":

1. **Result header** — heading "Your result", a muted "Graded
   {gradedAt}" line, and **two** short honest notes on separate lines:

   - **(a)** "AI-generated coaching feedback on your explanation." (same
     framing as the sibling M8 surface).
   - **(b)** **"Scoring is over your explanation only — this page does
     not claim 'this passes.' Your code was not run, built, linted, or
     tested. Code snippets are illustrative context and are not scored
     for style, naming, or plausibility."** Render this as plain header
     text — not a tooltip, not a dismissible callout.

2. **Score summary** — prominent but **calm**: the `score` as a clear
   0–100 value (optionally with a quiet progress ring or bar conveying
   magnitude — not a pass/fail color block), the `scoreLabel` band
   beside it, and the `summary` prose (this is the short feedback
   paragraph). A small derived line like "3 of 5 acceptance criteria
   met" (from `questionGrades`) is fine. **Use the same band labels
   ("Solid grasp", "Getting there", "Needs review") as the sibling M8
   surface — do not invent new ones.**

3. **Per-criterion result list** — heading "Per-criterion feedback".
   Render `questionGrades` as a list (a `Card` or `Collapsible` per
   criterion, but the feedback prose visible by default). Each row
   shows:

   - the criterion's prose (`questionPrompt`) echoed;
   - a **verdict badge** — **"Met" / "Partially met" / "Not met" / "No
     attempt"** — calm coloring, meaning in the text;
   - the `pointsAwarded` / `pointsPossible` ("2 / 3 points");
   - the `feedback` prose;
   - any file/module paths named in the feedback rendered as monospace
     chips (in-page anchors targeting the corresponding file in the
     parent Challenge Detail Page's in-scope set);
   - a small `focusArea` tag linking the criterion to its weak-area
     block in §4.

4. **Weak-area breakdown** — heading "Areas to focus on". Render
   `weakAreas`, one **weak-area block** each, **matching the sibling M8
   surface's weak-area block exactly**:

   - the `area` name as the block heading;
   - the `explanation` prose;
   - the `suggestion` prose framed "What to do next";
   - the `relatedQuestionIds` as small links/anchors ("From criterion
     2, 4");
   - when `fileRefs` is non-empty, the file path(s) as monospace chips
     styled as in-page anchors (they will scroll to the file's entry
     in the parent page's in-scope set).

   This is the most actionable content — give it generous space;
   plainly visible, **never collapsed by default**.

5. **Retry affordance** — heading "Try again". A single calm
   button-styled link **"Retry this challenge"** that navigates to
   `retryHref`. Below it, a short helper line:

   > Submitting a new attempt keeps this one in your history — your
   > latest outcome becomes the challenge's current status.

   The retry control is secondary visually — the *content above* is the
   primary draw. **Always render the retry block, regardless of
   `score`** — there is deliberately no pass/fail gating on retry. The
   control's accessible name names the target ("Retry this challenge —
   return to the walkthrough to submit a new attempt").

### States — design these

Provide a toggle to preview both:

- **Populated** — score summary, per-criterion result list, weak-area
  breakdown, and retry block as above.
- **Empty weak areas** — when `weakAreas` is empty (the explanation
  covered the challenge well), the "Areas to focus on" section shows a
  calm encouraging message instead: heading **"No specific weak areas
  — nice work"** and a short line ("Your explanation covered the
  challenge well. Re-read the per-criterion feedback above for any
  small refinements."). The score summary, per-criterion list, short
  feedback paragraph, and retry block still render fully. This is a
  positive outcome, not an empty/error state.

(There is no loading or error state for this component — it renders
only when a stored, validated grading result exists; loading and
grading-failure belong to the sibling Debug Walkthrough UI and the
parent page. Do **not** design a "broken file reference" fallback —
the parent guarantees every file reference is real.)

### Visual & accessibility requirements

- Clean, calm, content-first — a guide, not a verdict. No confetti, no
  red "FAIL", no green "PASS"; honest, encouraging feedback.
- Fully responsive; comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no hard-coded
  colors).
- Use **lucide-react** icons.
- Semantic HTML: the section has one heading (an `<h2>` within the
  page); the score summary, per-criterion result list, weak-area
  breakdown, and retry block are `<h3>` sub-sections; no skipped
  heading levels. The per-criterion list and the weak-area list are
  `<ul>`s.
- **The score and `scoreLabel` are conveyed by text and number — a
  progress ring/bar is supportive only; a low score is never signalled
  by color alone.**
- **Verdict badges convey meaning by their text label, not color
  alone.**
- The "AI-generated coaching feedback" note **and** the FR-7 honesty
  line ("Scoring is over your explanation only — this page does not
  claim 'this passes'...") are real text in the header — not tooltips,
  not dismissible callouts, not icon-only signals.
- Related-criterion and file-reference anchors are keyboard-operable
  with visible focus rings and accessible names including their
  target.
- The retry control is keyboard-operable (Enter / Space), with a
  visible focus ring and an accessible name that names the target.
- All text meets WCAG AA contrast in both themes.

### Components to use

shadcn/ui: `Card` (`CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`), `Badge`, `Progress` (for the optional score bar),
`Separator`, `Collapsible`, `Button`. lucide-react for icons
(award / target, check-circle, circle-dot, x-circle, file, lightbulb,
rotate-ccw for the retry control). Keep the component small and
composable so it integrates cleanly into an existing shadcn/ui
monorepo — reuse `packages/ui` rather than duplicating primitives.

---

## Notes for the integrator (task #148)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) —
  **reuse it**; do not duplicate primitives.
- This component renders the M9 graded result for a single
  `challenge_attempts` row. The host route is owned by the Challenge
  Detail Page spec (`docs/design/challenge-detail-page.md`, #145) —
  follow whichever placement (inline on the Detail Page vs. own
  sub-route) that spec records. Suggested home:
  `apps/web/components/challenges/completion-review.tsx`. It is a
  **Server Component** for the result content — it does **no** data
  fetching; it receives `grading: GradingResult`,
  `challenge: Challenge`, `projectMapPaths: string[]`, and
  `retryHref: string` as props. The retry control may be a small
  client island (a `Link` / `Button`) — no other client state is
  needed.
- The parent renders this component **only when
  `ChallengeAttempt.grading` is non-null and has passed the
  file-reference integrity check (task #141)**. An attempt that has
  not been graded shows the Debug Walkthrough UI's pre-submit /
  in-flight state instead.
- The `GradingResult` / `QuestionGrade` / `WeakArea` shapes are shared
  with M8 (`docs/design/score-weak-area.md` §5 / `packages/db`) — R4
  normative. Reconcile the mock shapes with the merged `packages/db`
  types from the M9 grading call (task #143); the merged types are
  authoritative if they drift.
- Wire each `weakArea.fileRefs` chip and each per-criterion
  `feedback` file chip as an **in-page anchor** to the matching
  file's entry in the Challenge Detail Page's in-scope set (#145).
  **There is no plain-text fallback for unresolved file references** —
  the integrity check (#141) rejects grading outputs with unresolved
  references before they are persisted.
- Wire the **"Retry this challenge"** affordance to the Debug
  Walkthrough UI's route (resolved by #145 — either inline state on
  the Detail Page or a sub-route under
  `apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/...`).
  Submitting a new attempt produces a **new** `challenge_attempts`
  row; the existing attempt and its grading are preserved (R5 /
  FR-10). The latest attempt becomes the challenge's current
  outcome.
- Verify the result against `docs/design/completion-review-ui.md` §14
  acceptance criteria; record integration notes in
  `docs/design/ui-integration-notes/completion-review-ui.md` at
  integration time.
