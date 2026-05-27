# Page Spec: Understanding Questions UI

Issue: #136 · Epic: `issue-based-learning-workspace` · PRD: `.claude/prds/issue-based-learning-workspace.md` (FR-2, FR-5, FR-8, FR-10)

This spec defines the **Understanding Questions UI** for Milestone 7. It is
the input to the Claude Design prompt
(`docs/design/ui-prompts/understanding-questions.prompt.md`) and to the
integration task #138. It must be human-reviewed before the prompt is run.
(UI tool: **Claude Design** — see **ADR 0007**, which establishes Claude
Design as the only UI-generation tool used in this project.)

The Understanding Questions UI is **not a standalone route** — it is the
interactive component embedded in the **Issue Learning Workspace** page
(`docs/design/issue-learning-workspace.page-spec.md` §6f, §6g) at route
`/repos/[owner]/[repo]/issues/[issueRef]`. It owns the **full
answer-and-score loop** for M7: question display, answer entry, the bounded
grading call, and the Score / Weak Area block that follows. **Its shape
mirrors M8's Score / Weak Area UI** (see `docs/design/understanding-check.md`
and `docs/design/score-weak-area.md`) — the two milestones produce one
comprehension-grading pattern in the product (PRD NFR Fair grading). It
shares layout, components, and tone with the rest of M7 and the M6 / M8
pages so the whole app reads as one product.

---

## 1. Page name

**Understanding Questions UI** — the embedded comprehension component within
the Issue Learning Workspace page: it displays the understanding questions
generated for the issue, collects the user's answers, submits them for
grading, and renders the resulting score and weak-area breakdown.

## 2. User goal

> "I've read the restated goal, the related files, the concepts, and the
> AI-agent execution notes for this issue. Now test me — ask me about *this*
> issue in *my* repo, let me write my answers, grade them, and tell me
> exactly which topics I should revisit before I sit in an interview and get
> asked about this code. Treat me to the same grading shape the diff-review
> surface uses so I can tell I'm using one product."

The user reads each question, types or selects an answer, submits, sees the
grading-in-progress state for a few seconds, and is taken into the graded
result — a numeric score, per-question feedback, and a named list of weak
areas to study.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She
tends to *assume* she understood an issue before letting an AI write the
diff; the understanding questions are where that assumption gets tested.

Design implications:
- **A check, not an exam.** The tone is supportive and low-pressure — this
  is practice for an interview, not a graded test with a pass/fail stigma.
  No timer, no penalty for blank answers.
- **Questions tied to the issue.** Each question is about *this* issue in
  *this* repo (PRD FR-4, US-6 acceptance) — the UI shows the question text
  plainly and, where the question references a file, surfaces that file so
  the user can connect the question to the code.
- **Honest effort.** Answers are free text — the user writes in their own
  words, the way they would in an interview.
- **A guide, not a verdict.** The graded result is calm and encouraging.
  The score shows *where to focus*; the **weak areas are the actionable
  payoff** — concrete, named topics tied to the questions the user
  struggled with. They get first-class space.
- **One product across M7 and M8.** The grading shape — `Score` and
  `WeakArea[]` — **mirrors M8's `GradingResult` / `WeakArea` shape**
  (`docs/design/score-weak-area.md` §5) so the two surfaces feel like one
  product, not two (PRD NFR Fair grading).
- **Honest about AI.** The questions are AI-generated and the grading is
  an AI-generated call (ADR 0005); the UI says so plainly (it inherits the
  Issue Learning Workspace's "AI-generated learning unit" framing and adds
  a short note that grading is automated coaching feedback).
- **No accounts, no setup.** M7 has no authentication; answers and the
  graded result persist by unit id.

## 4. Route(s)

**No route of its own.** The component is rendered inside
`apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx` (the Issue
Learning Workspace page) as the §6f "Check your understanding" section and,
when graded, as the §6g "Your result" sub-section directly below it.
Suggested home:
`apps/web/components/learning/understanding-questions.tsx` (with a
co-located `score-weak-area.tsx` for the result half, or one combined
component — final shape is the integrator's call, task #138). The form
half is a **Client Component island** (it holds answer state and submits);
the result half can be a Server Component rendering already-stored data.
The submit goes through a **server action** (no API route — ADR 0006).

## 5. Data source / contract

The component **receives the questions, any prior answers, and any stored
grading as props** — it does no fetching. Its parent (the Issue Learning
Workspace page) loads the `LearningUnit` via the M7 data-access layer
(`getLearningUnitByRef`, task #135).

```ts
interface UnderstandingQuestionsProps {
  unitId: number
  questions: Question[]
  // The user's previously stored answers, if they have already answered.
  // null on a fresh unit — the form is then in its blank, active state.
  priorAnswers: AnswerRecord[] | null
  // The stored grading result, if grading has completed; null on a fresh
  // or unanswered unit. When non-null the component renders the graded
  // read-only view + the Score / Weak Area block.
  score: Score | null
  weakAreas: WeakArea[] | null
  // For mapping a question / weak area back to the unit's related files
  // and concepts, so file references can be in-page anchors into Issue
  // Learning Workspace §6b and concept tags into §6c.
  relatedFilePaths: string[]
  conceptNames: string[]
}

// The submit path — a server action wired by the integrator (task #138).
// It calls the M7 data-access layer (task #135), which runs the bounded
// grading call (task #134) and persists user_answers + score +
// weak_areas as JSON columns on learning_units (FR-5, FR-8, R2).
gradeLearningUnit(
  unitId: number,
  answers: AnswerInput[],
): Promise<{ score: Score; weakAreas: WeakArea[] }>
```

### Typed contracts the component renders and produces

These are produced by the M7 generation call (`Question`, task #133) and
the M7 grading call (`Score`, `WeakArea`, task #134); they are part of the
`LearningUnit` contract
(`docs/design/issue-learning-workspace.page-spec.md` §5). The exact
TypeScript lives in `packages/db` (under `learning-units/`); if the merged
code differs at integration time the merged code is authoritative, but
the shape is fixed by PRD FR-2 / FR-5 / FR-8 and must not change without
updating this spec. The grading shape **mirrors M8's** — see
`docs/design/understanding-check.md` §5 / `docs/design/score-weak-area.md`
§5.

**`Question`** — one generated understanding question:

| Field | Type | Use |
|---|---|---|
| `id` | `string` | stable key; ties an answer to its question |
| `prompt` | `string` | the question text — references this issue's restated goal and related files |
| `kind` | `"free_text" \| "multiple_choice"` | answer-entry mode (see §7) |
| `choices` | `string[] \| null` | for `multiple_choice`: the options; `null` for `free_text` |
| `fileRefs` | `string[]` | related-file paths the question is about; may be empty |
| `conceptRefs` | `string[]` | concept names the question probes; may be empty |
| `focusArea` | `string` | the topic/skill the question probes (e.g. "Database transactions") — also the weak-area key |

**`AnswerInput`** — what the form submits, one per question:

| Field | Type | Use |
|---|---|---|
| `questionId` | `string` | the `Question.id` answered |
| `response` | `string` | the user's answer — free text, or the chosen option text |

**`AnswerRecord`** — a stored answer read back (`AnswerInput` plus
persistence fields):
`{ questionId: string; response: string; answeredAt: Date }`. Persisted
as the `user_answers` JSON column on `learning_units` (R2, FR-8).

**`Score`** — the grading call's headline output (**mirrors M8's
`GradingResult` minus the per-question breakdown** — the breakdown lives
inline on each `Question`/`AnswerRecord` pair via `QuestionGrade`):

| Field | Type | Use |
|---|---|---|
| `value` | `number` | overall score, **0–100** | §6a |
| `label` | `string` | a short calm band label, e.g. "Solid grasp", "Getting there", "Needs review" — same vocabulary as M8 | §6a |
| `summary` | `string` | one or two sentences of plain-language overall feedback | §6a |
| `questionGrades` | `QuestionGrade[]` | per-question grading | §6b — the breakdown |
| `gradedAt` | `Date` | when grading ran | §6 header |

**`QuestionGrade`** — one per `Question` answered (mirrors M8):

| Field | Type | Use |
|---|---|---|
| `questionId` | `string` | the `Question.id` graded |
| `questionPrompt` | `string` | the question text, echoed for context |
| `verdict` | `"correct" \| "partial" \| "incorrect" \| "unanswered"` | a calm per-question outcome badge |
| `pointsAwarded` / `pointsPossible` | `number` | this question's contribution to `Score.value` |
| `feedback` | `string` | plain-language feedback — what was right / missing |
| `focusArea` | `string` | the topic this question probed — ties to a `WeakArea` |

**`WeakArea`** — one focus topic the user should revisit (PRD FR-5,
mirrors M8):

| Field | Type | Use |
|---|---|---|
| `area` | `string` | the named topic, e.g. "Error handling in the API route" |
| `explanation` | `string` | why this is a weak area — what the user missed |
| `suggestion` | `string` | a concrete next step — what to study / do |
| `relatedQuestionIds` | `string[]` | the questions that revealed this weakness |
| `fileRefs` | `string[]` | related-file paths this area maps to; may be empty |
| `conceptRefs` | `string[]` | concept names this area maps to; may be empty |

Every `WeakArea.fileRefs` / `QuestionGrade` file reference, where
present, resolves to a path in `relatedFilePaths`. An unresolved
reference renders as plain text without an anchor — never a crash (the
M7 integrity check, task #135, should have rejected such a reference at
generation; runtime is defensive).

> **The answer-and-score loop — and the M8 mirror.** Fresh unit →
> `priorAnswers` is `null`, `score` and `weakAreas` are `null` → the
> form is **active**: questions shown, answers entered, submit enabled.
> On submit → `gradeLearningUnit` runs the bounded grading call and
> persists. After grading → `priorAnswers` holds the stored answers,
> `score` and `weakAreas` are populated → the component shows the
> submitted answers **read-only** and the **Score / Weak Area block**
> renders below — **same shape as M8's
> `docs/design/score-weak-area.md`** (score 0–100 + label + summary +
> per-question breakdown + weak-area breakdown). The two milestones
> produce one comprehension-grading pattern in the product.

> **R6 — strictly per-unit scoring.** `Score` and `weakAreas` are
> stored on **this `LearningUnit` only** — there is no aggregate
> rollup. M10 owns any cross-unit "comprehension score for this repo"
> view (PRD "Out of Scope"). This component renders only the per-unit
> grading.

## 6. Page sections

The component is a single headed section ("Check your understanding")
within the Issue Learning Workspace page, followed by a "Your result"
sub-section that appears only after grading. Top to bottom:

1. **Section header** — heading "Check your understanding" and a
   one-line description "Answer in your own words — these questions are
   about *this* issue in your repo. Your answers are graded into a
   score and a list of areas to focus on." A short, honest note that
   the questions and grading are AI-generated coaching feedback.
2. **Progress indicator** — when the form is active, a light "Answered
   2 of 5" counter (derived from non-empty answers). No timer, no
   pressure.
3. **Question list** — `questions` rendered as an ordered list, one
   **question block** per `Question`. Each block shows:
   - the question number and the `prompt` text;
   - a small `focusArea` tag (e.g. "Database transactions") so the
     user sees what is being probed;
   - when `fileRefs` is non-empty, the referenced file path(s) as
     monospace chips, each an in-page anchor to that file's entry in
     the Issue Learning Workspace §6b related-files section;
   - when `conceptRefs` is non-empty, small tags linking to the
     matching concepts in §6c;
   - the **answer input** appropriate to `kind` (§7).
4. **Submit area** — a primary **"Submit answers"** button and a short
   reassurance line ("Grading takes a few seconds while your answers
   are reviewed."). Blank answers are allowed; when some are blank, a
   gentle inline note ("2 questions are still blank") is shown —
   informational, not a block.
5. **Grading in progress** — see §9 — covers the few-second bounded
   grading call; inputs and submit are inert; typed answers stay
   visible.
6. **Graded (read-only) view of the form** — once `score`/`weakAreas`
   are populated, the question list re-renders with the user's
   submitted answer shown read-only beneath each question (no inputs,
   no submit button).

### 6a. Score summary — mirrors M8 §6a

The headline outcome, prominent but **calm** — not a trophy, not a
failure stamp (mirrors `docs/design/score-weak-area.md` §6a):
- the `Score.value` shown clearly as a **0–100** value, optionally with
  a quiet progress ring or bar (the bar conveys magnitude; it is not a
  pass/fail color block);
- the `Score.label` band ("Solid grasp" / "Getting there" / "Needs
  review") beside it — same vocabulary as M8;
- the `Score.summary` prose — one or two encouraging, honest sentences.
- A small derived line is acceptable, e.g. "{n} of {m} questions
  answered well", computed from `questionGrades`.

The framing throughout: this score shows *where to focus*, it is not a
verdict.

### 6b. Per-question breakdown — mirrors M8 §6b

`Score.questionGrades` rendered as a list, one row per graded question.
Each row shows (mirrors `docs/design/score-weak-area.md` §6b):
- the `questionPrompt` (the question, echoed so the user need not
  scroll back);
- a **verdict badge** — "Correct" / "Partial" / "Incorrect" / "Not
  answered" — calm coloring, meaning carried by the text;
- the `pointsAwarded` / `pointsPossible` (e.g. "2 / 3 points");
- the `feedback` prose — what was right, what was missing;
- a small `focusArea` tag linking the question to its weak area.

### 6c. Weak-area breakdown — the actionable payoff, mirrors M8 §6c

`weakAreas` rendered as a clearly headed sub-section ("Areas to focus
on"), one **weak-area block** per `WeakArea`. Each block shows (mirrors
`docs/design/score-weak-area.md` §6c):
- the `area` name as the block heading;
- the `explanation` prose — why this is a gap;
- the `suggestion` prose, framed "What to do next" — the concrete next
  step;
- the `relatedQuestionIds` surfaced as small links/anchors to the
  matching rows in §6b ("From question 2, 4");
- when `fileRefs` is non-empty, the related-file path(s) as monospace
  chips, each an in-page anchor to §6b of the parent;
- when `conceptRefs` is non-empty, small tags linking to the matching
  concepts in §6c of the parent.

The weak-area blocks are the most actionable content on the result —
generous space; plainly visible, never collapsed by default.

If `weakAreas` is empty (the user did well across the board), §6c
shows a calm, encouraging message — see §10.

## 7. Input fields

One answer field per `Question`, its type determined by `question.kind`
(mirrors M8 understanding-check):

| `kind` | Input | Behaviour |
|---|---|---|
| `free_text` | `Textarea` | The user writes their answer in their own words. Placeholder e.g. "Explain in your own words…". No length limit enforced in the UI; a soft character counter is optional. This is the primary, expected mode — interview-style answering. |
| `multiple_choice` | radio group | One selectable option per entry in `question.choices`. The submitted `response` is the chosen option's text. Used where the generation call produced a closed question. |

- Each field is labelled by its question `prompt` (programmatically
  associated).
- Answers are **optional to submit** — a blank answer is permitted and
  graded as unanswered (the check is formative; forcing every field
  would punish an honest "I don't know"). The submit button is always
  enabled once the form is active.
- The form holds answer state client-side until submit; on submit it
  builds an `AnswerInput[]` (one per question) and calls
  `gradeLearningUnit`.
- In the graded read-only view there are no editable inputs.

## 8. Primary actions

- **Answer a question** — type into a `free_text` Textarea or pick a
  `multiple_choice` option. The core activity.
- **Jump to a referenced file** — click a question's `fileRefs` chip
  to scroll to that file's related-file entry in the parent (§6b). An
  in-page anchor.
- **Jump to a probed concept** — click a question's `conceptRefs` tag
  to scroll to that concept in the parent (§6c). An in-page anchor.
- **Submit answers** — the primary action: builds `AnswerInput[]`,
  runs `gradeLearningUnit`, and on success transitions the section
  into the graded view with the Score / Weak Area block (§6a–§6c).
  This closes the answer-and-score loop.
- **Re-read submitted answers** — in the graded view, the answers are
  visible read-only alongside the score.
- **Jump from a weak area** — from a weak-area block to its
  `relatedQuestionIds` rows in §6b, to its `fileRefs` chip in the
  parent §6b, or to its `conceptRefs` tag in the parent §6c. In-page
  anchors.

There is no "reset"/"clear all" and no per-question save — the form
submits once as a unit.

## 9. Loading state

- **Before submit** — the component renders immediately from its
  props; there is no fetch, so no skeleton. (The route-level skeleton,
  including a question-list placeholder, is the Issue Learning
  Workspace page's `loading.tsx` —
  `docs/design/issue-learning-workspace.page-spec.md` §9.)
- **During grading** — `gradeLearningUnit` runs a **bounded LLM grading
  call that takes a few seconds** (PRD FR-5, ADR 0005). While it runs
  (mirrors M8 §9):
  - disable every answer input and the submit button; the button
    shows an in-progress label ("Grading your answers…") with a
    spinner;
  - show a short status line ("Reviewing your answers and scoring
    them — a few seconds.");
  - keep the questions and the user's typed answers **visible** (not
    replaced by a skeleton) so the user keeps context;
  - the submit region carries `aria-busy="true"` while the action
    runs.

## 10. Empty state

The M7 generation call always generates at least one understanding
question (PRD FR-3), so `questions` is non-empty in normal operation
and there is no data-driven empty state. The "nothing answered yet"
state **is** the default active form (every input blank) — not a
special empty screen.

Defensive case: if `questions` is unexpectedly empty, render the
section header with a quiet inline note ("No understanding questions
were generated for this unit.") instead of a bare heading or a broken
form.

**Empty `weakAreas` (positive outcome — mirrors M8 §10).** When
grading flagged no focus topics, §6c shows a calm, encouraging
message: heading "No specific weak areas — nice work" with a short
line ("Your answers covered this issue well. Re-read the per-question
feedback above for any small refinements."). This is a positive
outcome, not an empty/error state — the score summary and per-question
breakdown still render fully.

## 11. Error state

- **Validation** — there is essentially no blocking validation: blank
  answers are allowed (§7). The only inline note is the gentle "N
  questions are still blank" hint near the submit button —
  informational, not a block.
- **Grading failure** — if `gradeLearningUnit` fails (no API key, rate
  limit, network — CI runs with no API key, so this path is real and
  must be handled; mirrors M8 §11):
  - **do not** treat it as a page error and do not lose the user's
    work — the typed answers stay in the inputs;
  - re-enable the form and show a calm inline message in the submit
    area: heading "Couldn't grade your answers yet", a short
    explanation ("This can happen if the AI grading service is
    unavailable. Your answers are kept — try again."), and a **"Try
    again"** button that re-submits the same answers;
  - never show a stack trace; never blow away the answers.
- **Load failure** — a failure to load the `LearningUnit` itself is
  handled by the Issue Learning Workspace page's route `error.tsx`
  boundary, not here
  (`docs/design/issue-learning-workspace.page-spec.md` §11).
- **Unresolved file reference** — a `Question.fileRefs` or
  `WeakArea.fileRefs` entry not in `relatedFilePaths` renders as plain
  monospace text without an anchor — never a dead link, never a crash
  (PRD NFR "project-grounded").

## 12. Success state

- **Active form** — every question renders with its prompt,
  focus-area tag, file references, concept tags, and the correct
  answer input; the progress counter is accurate; the submit button
  is enabled.
- **On successful submit** — the answers are persisted as the
  `user_answers` JSON column, `Score` and `WeakArea[]` are persisted
  as the `score` and `weak_areas` JSON columns (R2, FR-8), the
  section transitions into the **graded read-only view** and the
  **Score / Weak Area block** (§6a–§6c) renders below — **mirroring
  M8's shape**. The Issue Learning Workspace page header gains its
  "answered" line. This transition is the completed answer-and-score
  loop.
- A returning user whose unit is already graded sees the graded
  read-only view immediately (no blank form) — `priorAnswers`,
  `score`, and `weakAreas` are all populated.
- A brief, non-blocking confirmation (an inline note or toast, e.g.
  "Answers submitted and graded") may acknowledge the submit; the
  score itself is the real confirmation.

## 13. Accessibility notes

- **Semantics & headings.** The section has one heading ("Check your
  understanding") at the level the parent page assigns it (an `<h2>`);
  within it, the score summary, per-question breakdown, and weak-area
  breakdown are `<h3>` sub-sections, with no skipped heading levels.
  The question list is an `<ol>`; the question-grade list and the
  weak-area list are `<ul>`s. Each question block has a programmatic
  grouping so its label, input, and any inline note are associated.
- **Labels.** Every answer input has its question `prompt` as a
  programmatically associated label. `multiple_choice` options are a
  labelled radio group in a `<fieldset>` with the prompt as the
  `<legend>`.
- **File-reference chips and concept tags.** Each chip / tag is a
  keyboard-operable in-page anchor with an accessible name including
  the target ("Jump to file `apps/web/lib/foo.ts`", "Jump to concept
  Database transactions"); visible focus ring; an unresolved reference
  is plain text, not a dead link.
- **Submitting.** The submit region carries `aria-busy="true"` while
  grading runs; the disabled state of inputs and button is not
  conveyed by color alone.
- **Grading-failure message.** A real, announced `aria-live` region —
  real text, not a color-only signal — and the "Try again" control is
  a real button.
- **Score not color-only.** The `Score.value` and `Score.label` are
  conveyed by text and number — a progress ring/bar is supportive
  only; a low score is never signalled by color alone (mirrors M8 §13).
- **Verdict badges.** "Correct" / "Partial" / "Incorrect" / "Not
  answered" badges convey meaning by their text label; color is
  supportive and AA-contrast in both themes.
- **AI-generated label.** The "AI-generated coaching feedback" framing
  is real, announced text — not a color-only or icon-only signal.
- **Graded read-only view.** The submitted answers are exposed as
  readable text (not disabled inputs that a screen reader skips); the
  transition to the graded view moves focus predictably toward the
  result.
- **Empty-`weakAreas` message** is real text content, not a color-only
  signal.
- **Keyboard.** Full keyboard operability in logical (DOM = visual)
  order: every answer input, every chip/tag, the submit button, every
  in-page anchor are reachable; Enter/Space activate; radio groups
  use arrow keys. Visible focus ring throughout.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes
  (the app uses `next-themes`). The `focusArea` tag and progress
  counter convey meaning by text, not color alone.
- **Targets.** Inputs, radio options, chips, and the submit button are
  comfortably sized for pointer and touch.

## 14. What this page does not do

- It **does not gate on checklist completion** (R4, FR-6). The
  Understanding Questions form is always available regardless of
  `checklistState` — the grading call has no dependency on the
  checklist (see the Review Checklist spec for the normative
  surfacing).
- It **does not produce a per-repo or cross-repo aggregate score**
  (R6). `Score` and `WeakArea[]` are stored on this `LearningUnit`
  only; M10 owns any rollup (PRD "Out of Scope").
- It **does not implement spaced-repetition memory** — that is closer
  to M10 (PRD "Out of Scope").
- It **does not write to GitHub** — read-only per ADR 0009 (PRD "Out
  of Scope").
- It **does not let the user create or edit questions** — questions
  are generated by the M7 generation call (task #133) and are stable
  for the unit's lifetime.
- It **does not allow re-answering once graded** — re-answer is not
  in M7 scope (PRD "Out of Scope" mirrors M8). A returning user sees
  the graded read-only view; revisiting answers is a future
  consideration.

## 15. Acceptance criteria

- [ ] The component renders **every** `Question` in `questions`, each
      showing its `prompt`, a `focusArea` tag, any `fileRefs` as
      in-page anchor chips, and any `conceptRefs` as concept tags.
- [ ] Each question has the correct answer input for its `kind` — a
      `Textarea` for `free_text`, a labelled radio group for
      `multiple_choice`.
- [ ] The user can enter answers; submitting builds an
      `AnswerInput[]` (one per question) and calls `gradeLearningUnit`
      via a **server action** (no API route — ADR 0006), which
      persists `user_answers` + `score` + `weak_areas` as JSON
      columns on `learning_units` (R2, FR-8).
- [ ] A **grading in-progress** state covers the few-second bounded
      grading call: inputs and submit are inert, the button shows
      progress, a reassurance line is shown, the typed answers stay
      visible.
- [ ] On a **successful submit**, the section transitions to the
      graded read-only view and the **Score / Weak Area block**
      renders — **mirroring M8's
      `docs/design/score-weak-area.md` shape** (score 0–100 + label +
      summary + per-question breakdown + weak-area breakdown), per
      the PRD's NFR Fair grading.
- [ ] The **weak-area breakdown** renders every `WeakArea` with its
      `area`, `explanation`, `suggestion`, related-question links,
      and any `fileRefs` / `conceptRefs` as in-page anchors —
      plainly visible, never collapsed by default.
- [ ] An **empty `weakAreas`** array shows a calm "no specific weak
      areas" message — a positive outcome, not an empty/error state;
      the score and per-question breakdown still render.
- [ ] A **grading failure** does not lose the user's answers and is
      **not** a page error: a calm inline "Try again" message
      re-submits the same answers.
- [ ] Blank answers are **allowed** (graded as unanswered); a gentle
      "N still blank" hint is informational, not a block.
- [ ] A **graded** unit (`score`/`weakAreas` populated) shows the
      submitted answers read-only — no blank form for a returning
      user; the Score / Weak Area block renders below.
- [ ] Scoring is **strictly per-unit** (R6) — no aggregate rollup,
      no per-repo score view on this component.
- [ ] The component receives
      `questions`/`priorAnswers`/`score`/`weakAreas`/
      `relatedFilePaths`/`conceptNames`/`unitId` as props — it does
      **no** data fetching.
- [ ] The component reads as one product with the rest of M7, the
      M8 diff-review pages, and the M6 project-map pages — shared
      components, spacing, and a calm, encouraging tone.
- [ ] Accessibility notes in §13 are satisfied (heading order,
      associated labels, fieldset/legend for choices, accessible
      chips/tags, focus management, announced grading-failure
      message, score/verdict not color-only, AA contrast).
- [ ] The component is generated through **Claude Design (ADR
      0007)** — the only UI-generation tool used in this project.
      Page Spec is human-reviewed before the Claude Design prompt is
      used (Definition of Done, task #136).
