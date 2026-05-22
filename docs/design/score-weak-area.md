# Page Spec: Score / Weak Area UI

Issue: #115 · Epic: `diff-review` · PRD: `.claude/prds/diff-review.md` (FR-5, FR-8)

This spec defines the **Score / Weak Area UI** for Milestone 8. It is the input
to the Claude Design prompt (`docs/design/ui-prompts/score-weak-area.md`) and to
the integration task #116. It must be human-reviewed before the prompt is run.
(UI tool: Claude Design — see ADR 0007.)

The Score / Weak Area UI is **not a standalone route** — it is the component
embedded in the **Diff Review** page (`docs/design/diff-review-page.md` §6g) at
route `/reviews/[id]`. It is the **graded-result half of the answer-and-score
loop**; its sibling, the **Understanding Check UI**
(`docs/design/understanding-check.md`), is the question-display and answer-entry
half. The two together define the full loop. The Score / Weak Area UI shares
layout, components, and tone with the rest of M8 and the M2–M4 pages.

---

## 1. Page name

**Score / Weak Area UI** — the embedded result component within the Diff Review
page: it presents the graded outcome of the Understanding Check — a numeric
score, a per-question breakdown, and a weak-area breakdown of the topics the
user should focus on.

## 2. User goal

> "I answered the questions about this AI-written change. Tell me how I did —
> a clear score, where I was strong, and exactly which topics I need to revisit
> before I sit in an interview and get asked about this code."

The user reads their score, sees which questions they got right or weak on, and
gets a concrete, named list of weak areas to study.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She wants
honest, actionable feedback — not a black-box grade.

Design implications:
- **A guide, not a verdict.** The score is calm and encouraging — it tells Mia
  where to put effort, it does not stamp her as pass/fail. No red "FAIL", no
  celebratory confetti; honest, plain feedback.
- **Weak areas are the payoff.** The score is a summary; the **weak areas** are
  the actionable part — concrete, named topics tied to the questions she
  struggled with. They get first-class space, not a footnote.
- **Grounded and inspectable.** Each weak area and per-question grade cites the
  question it came from. The grading is itself an AI-generated call (ADR 0005) —
  the UI says so plainly and shows the reasoning, so it is inspectable, not an
  oracle.
- **Tied back to the diff.** Where a weak area maps to a changed file, the UI
  surfaces that file — so Mia knows exactly which code to go re-study.
- **No accounts, no setup.** M8 has no authentication; the result persists by
  review id and is revisitable.

## 4. Route(s)

**No route of its own.** The component is rendered inside
`apps/web/app/reviews/[id]/page.tsx` (the Diff Review page) as the §6g "Your
result" section. It is a **Server Component** — it renders an already-stored
`GradingResult` and is read-only (its one interaction, optional in-page anchors,
needs no client state). Suggested home:
`apps/web/components/reviews/score-weak-area.tsx`. Final placement is the
integrator's call (task #116).

## 5. Data source / contract

The component **receives the grading result as a prop** — it does no fetching.
Its parent (the Diff Review page) loads the `DiffReview` via the M8 data-access
layer (`getDiffReviewById`, task #114); `DiffReview.grading` is what this
component renders. On a fresh, ungraded review `grading` is `null` and this
component is **not rendered at all** — the Understanding Check form is active
instead (`docs/design/diff-review-page.md` §6g, §12).

```ts
interface ScoreWeakAreaProps {
  // Non-null by construction — the parent renders this component only when the
  // review has been graded (DiffReview.grading is present).
  grading: GradingResult
  // For mapping a weak area / question back to the changed files it relates to,
  // so file references can be in-page anchors into Diff Review §6b.
  changedFilePaths: string[]
}
```

### `GradingResult` shape — the typed grading contract

`GradingResult` is `DiffReview.grading` (see `docs/design/diff-review-page.md`
§5). It is the structured output of the M8 bounded **grading call** (task #113),
which scores the user's `AnswerInput[]` against the `ComprehensionQuestion[]`.
The exact TypeScript lives in `packages/db`; if the merged code differs at
integration time the merged code is authoritative, but the shape is fixed by
PRD FR-5 and must not change without updating this spec.

| Field | Type | Use |
|---|---|---|
| `score` | `number` | overall score, **0–100** | §6a — the headline score |
| `scoreLabel` | `string` | a short calm band label, e.g. "Solid grasp", "Getting there", "Needs review" | §6a |
| `summary` | `string` | one or two sentences of plain-language overall feedback | §6a |
| `questionGrades` | `QuestionGrade[]` | per-question grading | §6b — the breakdown |
| `weakAreas` | `WeakArea[]` | the topics to focus on | §6c — the weak-area breakdown |
| `gradedAt` | `Date` | when grading ran | §6 header |

**`QuestionGrade`** — one per `ComprehensionQuestion` answered:

| Field | Type | Use |
|---|---|---|
| `questionId` | `string` | the `ComprehensionQuestion.id` graded |
| `questionPrompt` | `string` | the question text, echoed for context |
| `verdict` | `"correct" \| "partial" \| "incorrect" \| "unanswered"` | a calm per-question outcome badge |
| `pointsAwarded` / `pointsPossible` | `number` | the question's contribution to `score` |
| `feedback` | `string` | plain-language feedback on this answer — what was right/missing |
| `focusArea` | `string` | the topic this question probed — ties to a `WeakArea` |

**`WeakArea`** — one focus topic the user should revisit (PRD FR-5):

| Field | Type | Use |
|---|---|---|
| `area` | `string` | the named topic, e.g. "Error handling in the API route" |
| `explanation` | `string` | why this is a weak area — what the user missed |
| `suggestion` | `string` | a concrete next step to improve — what to study/do |
| `relatedQuestionIds` | `string[]` | the questions that revealed this weakness |
| `fileRefs` | `string[]` | changed-file paths this area maps to; may be empty |

Every `WeakArea.fileRefs` / `QuestionGrade` file reference, where present,
resolves to a path in the PR's changed-file set. An unresolved reference renders
as plain text without an anchor — never a crash.

> **The answer-and-score loop closes here.** The Understanding Check UI
> (`docs/design/understanding-check.md`) displays the questions and collects
> answers; on submit the bounded grading call produces this `GradingResult` and
> persists it; this component renders it. Together the two specs cover the loop
> end to end: question display → answer entry → graded score / weak-area
> presentation.

## 6. Page sections

The component is a single headed section ("Your result") within the Diff Review
page. Top to bottom:

1. **Result header** — heading "Your result" and a muted "Graded {gradedAt}"
   line. A short, honest note that the grade is AI-generated coaching feedback
   on the user's answers (ADR 0005) — real text, not an icon-only signal.

### 6a. Score summary

The headline outcome, prominent but **calm** — not a trophy, not a failure
stamp:
- the `score` shown clearly as a **0–100** value, optionally with a quiet
  progress ring or bar (the bar conveys magnitude; it is not a pass/fail color
  block);
- the `scoreLabel` band ("Solid grasp" / "Getting there" / "Needs review")
  beside it;
- the `summary` prose — one or two encouraging, honest sentences.
- A small derived line is acceptable, e.g. "{n} of {m} questions answered well",
  computed from `questionGrades`.

The framing throughout: this score shows *where to focus*, it is not a verdict.

### 6b. Per-question breakdown

`questionGrades` rendered as a list, one row per graded question. Each row shows:
- the `questionPrompt` (the question, echoed so the user need not scroll back);
- a **verdict badge** — "Correct" / "Partial" / "Incorrect" / "Not answered" —
  calm coloring, meaning carried by the text;
- the `pointsAwarded` / `pointsPossible` (e.g. "2 / 3 points");
- the `feedback` prose — what was right, what was missing;
- a small `focusArea` tag linking the question to its weak area.
This breakdown may be a list of `Card`s or a `Collapsible` per question (the
feedback prose, however, should be visible by default — it is the point).

### 6c. Weak-area breakdown — the actionable payoff

`weakAreas` rendered as a clearly headed sub-section ("Areas to focus on"), one
**weak-area block** per `WeakArea`. Each block shows:
- the `area` name as the block heading;
- the `explanation` prose — why this is a gap;
- the `suggestion` prose, framed "What to do next" — the concrete next step;
- the `relatedQuestionIds` surfaced as small links/anchors to the matching rows
  in §6b ("From question 2, 4");
- when `fileRefs` is non-empty, the changed-file path(s) as monospace chips,
  each an in-page anchor to that file's entry in the Diff Review §6b
  changed-files section — so the user can jump straight to the code to
  re-study.
The weak-area blocks are the most actionable content on the result — give them
generous space; they must be plainly visible, never collapsed by default.

If `weakAreas` is empty (the user did well across the board), §6c shows a calm,
encouraging message instead — see §10.

## 7. Input fields

The Score / Weak Area UI has **no input fields** — it is a read-only
presentation of a stored result. (The interactive part of the answer-and-score
loop is the Understanding Check UI, a separate spec.)

## 8. Primary actions

- **Read the result** — the score, the per-question breakdown, the weak areas.
  The main action.
- **Jump to a related question** — from a weak-area block to its
  `relatedQuestionIds` rows in §6b. An in-page anchor.
- **Jump to a related file** — from a weak-area block's `fileRefs` chip to that
  file's diff entry in the Diff Review page (§6b). An in-page anchor.

No create/edit/delete — the grading result is produced by the M8 grading call
and is immutable once stored. (Re-answering is not in M8 scope — PRD "Out of
Scope" excludes a spaced-repetition model.)

## 9. Loading state

The component does **not** own a loading state. Its parent (the Diff Review
page, `docs/design/diff-review-page.md` §9) renders the route skeleton; the
few-second grading call's in-progress state belongs to the Understanding Check
UI (`docs/design/understanding-check.md` §9). By the time this component
renders, `grading` is already loaded and passed in.

## 10. Empty state

This component renders **only when a graded result exists** (`DiffReview.grading`
is non-null) — so there is no "no result" state; an ungraded review simply does
not render this component (the Understanding Check form shows instead).

The one within-component partial state is an **empty `weakAreas` array** — the
user answered well enough that grading flagged no focus topics. In that case
§6c shows a calm, encouraging message: heading "No specific weak areas — nice
work" with a short line ("Your answers covered the change well. Re-read the
per-question feedback above for any small refinements."). This is a positive
outcome, not an empty/error state — the score summary and per-question
breakdown still render fully.

## 11. Error state

The component does not fetch, so it has **no error state of its own**. A failure
to load the `DiffReview` is handled by the Diff Review page's route `error.tsx`
boundary; a failure of the grading *call* is handled inside the Understanding
Check UI (`docs/design/understanding-check.md` §11) — by the time this component
renders, grading has already succeeded and been stored.

The one defensive concern is an **unresolved file reference**: a `WeakArea` or
`QuestionGrade` file reference not in `changedFilePaths` renders as plain
non-linked text — the result still renders; the page does not crash.

## 12. Success state

- The component renders the score summary (score 0–100, label, summary prose),
  the per-question breakdown (every `QuestionGrade` with its verdict, points,
  and feedback), and the weak-area breakdown (every `WeakArea` with its
  explanation, suggestion, related questions, and file references) — every field
  of §5 has a home in the layout.
- When `weakAreas` is empty, §6c shows the calm "no specific weak areas"
  message instead of a bare heading.
- In-page anchors to related questions and changed files work.
- This component appearing **is** the success state of the answer-and-score
  loop — there is no separate toast; the score and weak areas are the
  confirmation that the loop completed.

## 13. Accessibility notes

- **Semantics & headings.** The section has one heading ("Your result") at the
  level the Diff Review page assigns it (an `<h2>`); the score summary,
  per-question breakdown, and weak-area breakdown are `<h3>` sub-sections, with
  no skipped levels. The question-grade list and the weak-area list are `<ul>`s.
- **Score not color-only.** The score and `scoreLabel` are conveyed by text and
  number — a progress ring/bar is supportive only; meaning never rests on color
  alone. A low score is not signalled by red alone.
- **Verdict badges.** "Correct" / "Partial" / "Incorrect" / "Not answered"
  badges convey meaning by their text label; color is supportive and
  AA-contrast in both themes.
- **AI-generated label.** The "AI-generated coaching feedback" framing is real,
  announced text — not a color-only or icon-only signal.
- **In-page anchors.** Related-question and file-reference anchors have
  accessible names that include their target ("Jump to question 2", "Jump to
  changes in `src/api/handler.ts`"); keyboard-operable with a visible focus
  ring; an unresolved file reference is plain text, not a dead link.
- **Reading order.** DOM order = visual order: header → score summary →
  per-question breakdown → weak areas. Logical for a screen reader top to
  bottom.
- **States announced.** The empty-`weakAreas` message is real text content, not
  a color-only signal.
- **Keyboard.** Every in-page anchor is reachable in logical order; Enter
  activates. Visible focus ring throughout.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes (the app
  uses `next-themes`).
- **Targets.** Anchor links are comfortably sized for pointer and touch.

## 14. Acceptance criteria

- [ ] The component renders the **score** as a clear 0–100 value with its
      `scoreLabel` band and `summary` prose — calm and encouraging, not a
      pass/fail verdict.
- [ ] The **per-question breakdown** renders every `QuestionGrade` with its
      echoed prompt, a `verdict` badge, the points awarded/possible, and the
      feedback prose.
- [ ] The **weak-area breakdown** renders every `WeakArea` with its `area`
      name, `explanation`, `suggestion`, related-question links, and any
      `fileRefs` as in-page anchor chips — plainly visible, never collapsed by
      default.
- [ ] File and related-question references are **in-page anchors** (to the Diff
      Review changed-files section and the per-question rows); an unresolved
      file reference is plain text, never a crash.
- [ ] An **empty `weakAreas`** array shows a calm "no specific weak areas"
      message — a positive outcome, not an empty/error state; the score and
      per-question breakdown still render.
- [ ] The component renders **only when `DiffReview.grading` is non-null** — it
      receives `grading` as a prop and does **no** data fetching.
- [ ] The component, together with the Understanding Check UI, completes the
      **answer-and-score loop** — question display → answer entry → graded
      score / weak-area presentation.
- [ ] The component reads as one product with the rest of M8 and the M2–M4
      pages — shared components, spacing, and a calm, encouraging tone.
- [ ] Accessibility notes in §13 are satisfied (heading order, score/verdict not
      color-only, AI-generated label as real text, accessible in-page anchors,
      AA contrast).
- [ ] Page spec is human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #115).
