# Page Spec: Understanding Check UI

Issue: #115 · Epic: `diff-review` · PRD: `.claude/prds/diff-review.md` (FR-3, FR-5, FR-8)

This spec defines the **Understanding Check UI** for Milestone 8. It is the
input to the Claude Design prompt
(`docs/design/ui-prompts/understanding-check.md`) and to the integration task
#116. It must be human-reviewed before the prompt is run. (UI tool: Claude
Design — see ADR 0007.)

The Understanding Check UI is **not a standalone route** — it is the
interactive component embedded in the **Diff Review** page
(`docs/design/diff-review-page.md` §6f) at route `/reviews/[id]`. It is the
**question-display and answer-entry half of the answer-and-score loop**; its
sibling, the **Score / Weak Area UI** (`docs/design/score-weak-area.md`), is the
graded-result half. The two are specified separately but together define the
full loop. The Understanding Check shares layout, components, and tone with the
rest of M8 and the M2–M4 pages.

---

## 1. Page name

**Understanding Check UI** — the embedded comprehension-check component within
the Diff Review page: it displays the comprehension questions generated for the
reviewed pull request, collects the user's answers, and submits them for
grading.

## 2. User goal

> "I've read the explanation of this AI-written change. Now test me — ask me
> about *this* diff, let me write my answers, and grade them — so I find out
> whether I actually understood it before I claim it in an interview."

The user reads each question, types or selects an answer, submits, and is taken
into the graded result.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She tends
to *assume* she understood an AI-generated change; the Understanding Check is
where that assumption gets tested.

Design implications:
- **A check, not an exam.** The tone is supportive and low-pressure — this is
  practice for an interview, not a graded test with a pass/fail stigma. Copy is
  encouraging; there is no timer, no penalty.
- **Questions tied to the diff.** Each question is about *this* PR (PRD FR-4) —
  the UI shows the question text plainly and, where the question references a
  file, surfaces that file so the user can connect the question to the code.
- **Honest effort.** Answers are free text — the user writes in their own words,
  the way they would in an interview. The form does not let them skip straight
  to the answer.
- **Honest about AI.** The questions are AI-generated and the grading is an
  AI-generated call; the UI says so plainly (it inherits the Diff Review page's
  "AI-generated review" framing and adds a short note that grading is automated
  coaching feedback).
- **No accounts, no setup.** M8 has no authentication; answers persist by
  review id.

## 4. Route(s)

**No route of its own.** The component is rendered inside
`apps/web/app/reviews/[id]/page.tsx` (the Diff Review page) as the §6f "Check
your understanding" section. It is a **Client Component island** (it holds
answer state and submits) — suggested home:
`apps/web/components/reviews/understanding-check.tsx`. The submit goes through a
**server action** (no API route — ADR 0006). Final placement is the
integrator's call (task #116).

## 5. Data source / contract

The component **receives the questions and any prior answers as props** — it
does no fetching. Its parent (the Diff Review page) loads the `DiffReview` via
the M8 data-access layer (`getDiffReviewById`, task #114).

```ts
interface UnderstandingCheckProps {
  reviewId: number
  questions: ComprehensionQuestion[]
  // The user's previously stored answers, if they have already answered.
  // null on a fresh review — the form is then in its blank, active state.
  priorAnswers: AnswerRecord[] | null
  // True once the review has been graded — the component then shows the
  // submitted (read-only) answers and yields to the Score / Weak Area UI.
  graded: boolean
}

// The submit path — a server action wired by the integrator (task #116).
// It calls the M8 grading data-access layer, which runs the bounded grading
// call (task #113) and persists answers + score (task #114).
gradeDiffReview(reviewId: number, answers: AnswerInput[]): Promise<GradingResult>
```

### Typed contracts the component renders and produces

These are produced by the M8 review call (`ComprehensionQuestion`, task #112)
and consumed by the grading call (`AnswerInput`, task #113); they are part of
the `DiffReview` contract (`docs/design/diff-review-page.md` §5). The exact
TypeScript lives in `packages/db`; if the merged code differs at integration
time the merged code is authoritative, but the shape is fixed by PRD
FR-3/FR-5 and must not change without updating this spec.

**`ComprehensionQuestion`** — one generated comprehension question:

| Field | Type | Use |
|---|---|---|
| `id` | `string` | stable key; ties an answer to its question |
| `prompt` | `string` | the question text — references this PR's diff |
| `kind` | `"free_text" \| "multiple_choice"` | answer-entry mode (see §7) |
| `choices` | `string[] \| null` | for `multiple_choice`: the options; `null` for `free_text` |
| `fileRefs` | `string[]` | changed-file paths the question is about; may be empty |
| `focusArea` | `string` | the topic/skill the question probes (e.g. "error handling") — also the weak-area key |

**`AnswerInput`** — what the form submits, one per question:

| Field | Type | Use |
|---|---|---|
| `questionId` | `string` | the `ComprehensionQuestion.id` answered |
| `response` | `string` | the user's answer — free text, or the chosen option text |

**`AnswerRecord`** — a stored answer read back (`AnswerInput` plus persistence
fields): `{ questionId: string; response: string; answeredAt: Date }`.

`GradingResult` (the grading call's output — score + weak areas) is defined in
`docs/design/score-weak-area.md` §5. On a successful submit the component hands
off to the Score / Weak Area UI to render it.

> **The answer-and-score loop.** Fresh review → `priorAnswers` is `null`,
> `graded` is `false` → the form is **active**: questions shown, answers
> entered, submit enabled. On submit → `gradeDiffReview` runs the bounded
> grading call and persists. After grading → `graded` is `true`,
> `priorAnswers` holds the stored answers → the component shows the submitted
> answers **read-only** and the Score / Weak Area UI renders the result. This
> spec covers the question-display and answer-entry side; the result side is
> `docs/design/score-weak-area.md`.

## 6. Page sections

The component is a single headed section within the Diff Review page. Top to
bottom:

1. **Section header** — heading "Check your understanding" and a one-line
   description "Answer in your own words — these questions are about the change
   you just reviewed. Your answers are graded into a score and a list of areas
   to focus on." A short, honest note that the questions and grading are
   AI-generated coaching feedback.
2. **Progress indicator** — when the form is active, a light "Answered 2 of 5"
   counter (derived from non-empty answers). No timer, no pressure.
3. **Question list** — `questions` rendered as an ordered list, one **question
   block** per `ComprehensionQuestion`. Each block shows:
   - the question number and the `prompt` text;
   - a small `focusArea` tag (e.g. "Error handling") so the user sees what is
     being probed;
   - when `fileRefs` is non-empty, the referenced file path(s) as monospace
     chips, each an in-page anchor to that file's entry in the Diff Review §6b
     changed-files section — so the user can connect the question to the code;
   - the **answer input** appropriate to `kind` (§7).
4. **Submit area** — a primary **"Submit answers"** button and a short
   reassurance line ("Grading takes a few seconds while your answers are
   reviewed."). When the form has unanswered questions, submission is still
   allowed (an unanswered question is graded as unanswered) but a gentle inline
   note says how many are blank.
5. **Graded (read-only) view** — when `graded` is `true`, the question list
   renders each question with the user's submitted answer shown read-only
   beneath it (no inputs, no submit button), and the section yields below to the
   Score / Weak Area UI. The user can re-read what they wrote alongside the
   result.

## 7. Input fields

One answer field per `ComprehensionQuestion`, its type determined by
`question.kind`:

| `kind` | Input | Behaviour |
|---|---|---|
| `free_text` | `Textarea` | The user writes their answer in their own words. Placeholder e.g. "Explain in your own words…". No length limit enforced in the UI; a soft character counter is optional. This is the primary, expected mode — interview-style answering. |
| `multiple_choice` | radio group | One selectable option per entry in `question.choices`. The submitted `response` is the chosen option's text. Used where the review call produced a closed question. |

- Each field is labelled by its question `prompt` (programmatically associated).
- Answers are **optional to submit** — a blank answer is permitted and graded as
  unanswered (the check is formative; forcing every field would punish an honest
  "I don't know"). The submit button is always enabled once the form is active.
- The form holds answer state client-side until submit; on submit it builds an
  `AnswerInput[]` (one per question, `response` = the textarea text or the
  chosen option) and calls `gradeDiffReview`.
- In the graded read-only view (§6.5) there are no editable inputs.

## 8. Primary actions

- **Answer a question** — type into a `free_text` Textarea or pick a
  `multiple_choice` option. The core activity.
- **Jump to a referenced file** — click a question's `fileRefs` chip to scroll
  to that file's diff entry in the Diff Review page (§6b). An in-page anchor.
- **Submit answers** — the primary action: builds `AnswerInput[]`, runs
  `gradeDiffReview`, and on success transitions the section into the graded view
  with the Score / Weak Area UI showing the result. This closes the
  answer-and-score loop.
- **Re-read submitted answers** — in the graded view, the answers are visible
  read-only alongside the score.

There is no "reset"/"clear all" and no per-question save — the form submits once
as a unit.

## 9. Loading state

- **Before submit** — the component renders immediately from its `questions`
  prop; there is no fetch, so no skeleton. (The route-level skeleton, including
  a question-list placeholder, is the Diff Review page's `loading.tsx` —
  `docs/design/diff-review-page.md` §9.)
- **During grading** — `gradeDiffReview` runs a **bounded LLM grading call that
  takes a few seconds** (PRD FR-5, ADR 0005). While it runs:
  - disable every answer input and the submit button; the button shows an
    in-progress label ("Grading your answers…") with a spinner;
  - show a short status line ("Reviewing your answers and scoring them — a few
    seconds.");
  - keep the questions and the user's typed answers **visible** (not replaced by
    a skeleton) so the user keeps context;
  - the submit region carries `aria-busy="true"` while the action runs.

## 10. Empty state

The M8 review call always generates at least one comprehension question (PRD
FR-3), so `questions` is non-empty in normal operation and there is no
data-driven empty state. The "nothing answered yet" state **is** the default
active form (every input blank) — not a special empty screen.

Defensive case: if `questions` is unexpectedly empty, render the section header
with a quiet inline note ("No comprehension questions were generated for this
review.") instead of a bare heading or a broken form.

## 11. Error state

- **Validation** — there is essentially no blocking validation: blank answers
  are allowed (§7). The only inline note is the gentle "N questions are still
  blank" hint near the submit button — informational, not a block.
- **Grading failure** — if `gradeDiffReview` fails (no API key, rate limit,
  network — CI runs with no API key, so this path is real and must be handled):
  - **do not** treat it as a page error and do not lose the user's work — the
    typed answers stay in the inputs;
  - re-enable the form and show a calm inline message in the submit area:
    heading "Couldn't grade your answers yet", a short explanation ("This can
    happen if the AI grading service is unavailable. Your answers are kept —
    try again."), and a **"Try again"** button that re-submits the same
    answers;
  - never show a stack trace; never blow away the answers.
- **Load failure** — a failure to load the `DiffReview` itself is handled by the
  Diff Review page's route `error.tsx` boundary, not here
  (`docs/design/diff-review-page.md` §11).

## 12. Success state

- **Active form** — every question renders with its prompt, focus-area tag, file
  references, and the correct answer input; the progress counter is accurate;
  the submit button is enabled.
- **On successful submit** — the answers are persisted, `GradingResult` is
  returned, the section transitions into the **graded read-only view** (§6.5)
  and the **Score / Weak Area UI** (`docs/design/score-weak-area.md`) renders
  the score and weak-area breakdown directly below. The Diff Review page header
  gains its "answered" line (`docs/design/diff-review-page.md` §12). This
  transition is the completed answer-and-score loop.
- A returning user whose review is already graded sees the graded read-only view
  immediately (no blank form) — `graded` is `true`, `priorAnswers` is populated.
- A brief, non-blocking confirmation (an inline note or toast, e.g. "Answers
  submitted and graded") may acknowledge the submit; the score itself is the
  real confirmation.

## 13. Accessibility notes

- **Semantics & headings.** The section has one heading ("Check your
  understanding") at the level the Diff Review page assigns it (an `<h2>`); the
  question list is an `<ol>`. Each question block has a programmatic grouping so
  its label, input, and any inline note are associated.
- **Labels.** Every answer input has its question `prompt` as a programmatically
  associated label. `multiple_choice` options are a labelled radio group in a
  `<fieldset>` with the prompt as the `<legend>`.
- **File reference chips.** Each `fileRefs` chip is a keyboard-operable in-page
  anchor with an accessible name including the path ("Jump to changes in
  `src/api/handler.ts`"); visible focus ring.
- **Submitting.** The submit region carries `aria-busy="true"` while grading
  runs; the disabled state of inputs and button is not conveyed by color alone.
- **Grading-failure message** is a real, announced `aria-live` region (it
  appears after an action), real text — not a color-only signal — and the
  "Try again" control is a real button.
- **Graded read-only view.** The submitted answers are exposed as readable text
  (not disabled inputs that a screen reader skips); the transition to the graded
  view moves focus predictably toward the result.
- **Keyboard.** Full keyboard operability in logical (DOM = visual) order: every
  answer input, every file-reference chip, and the submit button are reachable;
  Enter/Space activate; radio groups use arrow keys. Visible focus ring
  throughout.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes (the app
  uses `next-themes`). The `focusArea` tag and progress counter convey meaning
  by text, not color alone.
- **Targets.** Inputs, radio options, chips, and the submit button are
  comfortably sized for pointer and touch.

## 14. Acceptance criteria

- [ ] The component renders **every** `ComprehensionQuestion` in `questions`,
      each showing its `prompt`, a `focusArea` tag, and any `fileRefs` as
      in-page anchor chips.
- [ ] Each question has the correct answer input for its `kind` — a `Textarea`
      for `free_text`, a labelled radio group for `multiple_choice`.
- [ ] The user can enter answers; submitting builds an `AnswerInput[]` (one per
      question) and calls `gradeDiffReview` — the **answer-entry half of the
      answer-and-score loop**.
- [ ] A **grading in-progress** state covers the few-second bounded grading
      call: inputs and submit are inert, the button shows progress, a
      reassurance line is shown, the typed answers stay visible.
- [ ] On a **successful submit**, the section transitions to the graded
      read-only view and the Score / Weak Area UI renders the result — closing
      the loop.
- [ ] A **grading failure** does not lose the user's answers and is **not** a
      page error: a calm inline "Try again" message re-submits the same answers.
- [ ] Blank answers are **allowed** (graded as unanswered); a gentle "N still
      blank" hint is informational, not a block.
- [ ] A **graded** review (`graded` true, `priorAnswers` populated) shows the
      submitted answers read-only — no blank form for a returning user.
- [ ] The component receives `questions`/`priorAnswers`/`graded` as props — it
      does **no** data fetching; the submit goes through a server action, not an
      API route.
- [ ] The component reads as one product with the rest of M8 and the M2–M4
      pages — shared components, spacing, and a calm, encouraging tone.
- [ ] Accessibility notes in §13 are satisfied (heading order, associated
      labels, fieldset/legend for choices, accessible file chips, focus
      management, announced grading-failure message, AA contrast).
- [ ] Page spec is human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #115).
