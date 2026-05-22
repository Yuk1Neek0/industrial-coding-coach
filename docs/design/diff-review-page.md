# Page Spec: Diff Review

Issue: #115 · Epic: `diff-review` · PRD: `.claude/prds/diff-review.md` (FR-3, FR-4, FR-8)

This spec defines the **Diff Review** page for Milestone 8. It is the input to
the Claude Design prompt (`docs/design/ui-prompts/diff-review-page.md`) and to
the integration task #116. It must be human-reviewed before the prompt is run.
(UI tool: Claude Design — see ADR 0007.)

The Diff Review page is the **top-level page** of the four M8 UI pieces. Its
three siblings are nested inside it: the **Risk Analysis Panel**
(`docs/design/risk-analysis-panel.md`), the **Understanding Check UI**
(`docs/design/understanding-check.md`), and the **Score / Weak Area UI**
(`docs/design/score-weak-area.md`). All four share layout, components, and tone
with the M2 Catalog, M3 Registry, and M4 Recommendation pages so the whole app
reads as one product. The four pieces are specified separately so each is
reviewable on its own, but they integrate into the single route defined here.

---

## 1. Page name

**Diff Review** — a single-route page (`/reviews/[id]`) showing one stored diff
review of a pull request on the user's imported repository: the changed-file
explanations, the core-logic explanation, the risk analysis, the test
suggestions, and the comprehension questions. From this page the user works
through the answer-and-score loop and sees the graded result.

## 2. User goal

> "An AI wrote this pull request and I merged it without really understanding
> it. Show me what each file changed, what the change does as a whole, what
> could break — grounded in the actual diff, not generic advice — and then test
> me on it so I know I can defend it in an interview."

The user opens a review of a specific PR, reads the explanation grounded in the
real diff, studies the risks and test suggestions, then answers the
comprehension questions and receives a score and a weak-area breakdown.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She has
one or two AI-built portfolio projects she cannot confidently explain. She can
prompt an AI tool, run `pnpm`, and push to GitHub, but cannot justify a stack or
describe how a change flows through her code.

Design implications:
- **Diff first, then explanation.** Mia may not read raw patches fluently. Each
  changed-file explanation sits next to (or above) the hunk it explains, so the
  prose and the code are connected, not in separate worlds.
- **Grounded, not generic.** Every explanation and risk cites a real file path
  and, where relevant, a hunk. The page makes that grounding visible — a risk
  with no file reference would look broken, and that is intentional (PRD FR-4).
- **Honest about AI.** The review is itself AI-generated. The page carries a
  small, honest label saying so — on-thesis with ADR 0005: the coaching output
  is inspectable, not a black box.
- **Prove it, don't assume it.** The point of M8 is that Mia does not get to
  *assume* she understood. The comprehension questions and the graded result
  are first-class, not an afterthought tucked at the bottom.
- **No accounts, no setup.** M8 has no authentication; a review is reachable by
  its URL. The imported repo and its PRs come from M11.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the page shell; a
Client Component island for the answer-and-score loop (the Understanding Check
form and the result transition — see §6e and the sibling specs).

| Route | Purpose | File |
|---|---|---|
| `/reviews/[id]` | One stored diff review of a PR | `apps/web/app/reviews/[id]/page.tsx` |

- `id` is the integer primary key of the `diff_reviews` row (M8 schema, task
  #110), keyed internally by repo and PR number. It is the URL key.
- A loading UI (`loading.tsx`) and a not-found UI (`not-found.tsx`) accompany
  the route; an error boundary (`error.tsx`) covers it.
- The page is linkable and bookmarkable — a review can be revisited; a returning
  user with answers already stored sees the graded result, not a blank form
  (§6e, §12).
- How a user *selects* a PR to review (an index/picker over the imported repo's
  pull requests) is **out of scope for this spec** — task #116 wires PR
  selection. This spec assumes the user arrives at `/reviews/[id]` for an
  already-created review.

## 5. Data source / contract

The page is a **thin server-side view** over the typed M8 diff-reviews
data-access layer (`@workspace/db`, task #114). No client-side fetching, no API
route — Server Components call the data layer directly (ADR 0006). The
answer-and-score loop posts through a server action (see §6e and the
Understanding Check spec).

```ts
// M8 — the stored diff review
getDiffReviewById(id: number): Promise<DiffReview | null>

// Submitting the user's answers — invoked server-side from the
// Understanding Check form (see understanding-check.md / score-weak-area.md):
gradeDiffReview(id: number, answers: AnswerInput[]): Promise<DiffReview>
```

`getDiffReviewById` returns `null` when no row matches — the page treats `null`
as not-found (§11).

### `DiffReview` record shape — the M8 typed review contract

This is the **single contract** all four M8 UI pieces render and that
integration task #116 must satisfy. The exact TypeScript lives in
`packages/db` (the review call is task #112, grading is task #113, the schema is
task #110); if the field names below differ from the merged code at integration
time, the merged code is authoritative — but the *shape* is fixed by PRD FR-3 /
FR-5 and must not change without updating this spec.

A `DiffReview` carries:

| Field | Type | Used by |
|---|---|---|
| `id` | `number` | URL key |
| `repo` | `{ owner: string; name: string }` | §6 header — which repository |
| `pullRequest` | `PullRequestRef` | §6 header — which PR |
| `changedFiles` | `ChangedFileExplanation[]` | §6b — per-file explanations + diff |
| `coreLogicExplanation` | `string` | §6c — what the change does as a whole |
| `risks` | `RiskFinding[]` | §6d — the Risk Analysis Panel |
| `testSuggestions` | `TestSuggestion[]` | §6e — suggested tests |
| `questions` | `ComprehensionQuestion[]` | §6f — the Understanding Check |
| `answers` | `AnswerRecord[] \| null` | §6f/§6g — the user's stored answers; `null` until answered |
| `grading` | `GradingResult \| null` | §6g — the Score / Weak Area UI; `null` until graded |
| `createdAt` / `updatedAt` | `Date` | §6 header — "reviewed on" / "answered on" |

`PullRequestRef` (from the M11 GitHub client's PR fetch, task #111):

| Field | Type | Use |
|---|---|---|
| `number` | `number` | PR number, shown as "#123" |
| `title` | `string` | PR title in the header |
| `url` | `string` | link out to the PR on GitHub |
| `linkedIssue` | `{ number: number; title: string; acceptanceCriteria: string[] } \| null` | §6a — linked-issue context; **may be null** |

`ChangedFileExplanation` (one per changed file — PRD FR-4):

| Field | Type | Use |
|---|---|---|
| `path` | `string` | the real file path in the PR |
| `changeKind` | `"added" \| "modified" \| "removed" \| "renamed"` | badge on the file |
| `additions` / `deletions` | `number` | the `+`/`−` counts |
| `hunks` | `DiffHunk[]` | the patch hunks for this file |
| `explanation` | `string` | plain-language explanation of this file's change |

`DiffHunk`: `{ header: string; lines: { kind: "context" | "addition" | "deletion"; text: string }[] }`.

`RiskFinding`, `TestSuggestion`, `ComprehensionQuestion`, `AnswerRecord`,
`AnswerInput`, and `GradingResult` / `WeakArea` are defined in the sibling specs
(`risk-analysis-panel.md`, `understanding-check.md`, `score-weak-area.md`) —
they are the contracts those panels render. They are summarized here only where
this page composes them.

> **`answers` and `grading` are nullable together.** A freshly created review
> has `questions` but no `answers` and no `grading`. After the user completes
> the answer-and-score loop (§6e/§6f of the Understanding Check spec), both are
> populated. The page must render correctly in both states — unanswered (the
> Understanding Check form is active) and answered/graded (the Score / Weak Area
> UI is shown). This is the answer-and-score loop, end to end.

The review is guaranteed project-grounded: every `ChangedFileExplanation.path`
and every `RiskFinding` file reference resolves to a real path in the PR's
changed-file set (the M8 integrity check, task #114). If a reference
unexpectedly fails to resolve, the page renders it as plain text and flags it
quietly rather than crashing.

## 6. Page sections

Top to bottom, single readable column (comfortable max width):

1. **Back link** — "← Back to reviews" (to the PR/review index that task #116
   provides; this spec does not design that index).
2. **Review header** — the PR title as an `<h1>`, a muted line
   `{repo.owner}/{repo.name} · PR #{pullRequest.number}` with an external link
   "View on GitHub →" (`pullRequest.url`, new tab, `rel="noopener noreferrer"`),
   and a muted "Reviewed {createdAt}" line (and "· answered {updatedAt}" once
   graded). A small, honest **"AI-generated review"** label sits in the header —
   real text, not an icon-only signal (ADR 0005, §13).
3. **In-page section nav (optional)** — for a long review, a compact set of
   anchor links — "Files", "Core logic", "Risks", "Tests", "Understanding
   check" — so the user can jump between sections. Optional; if omitted the
   page is still a clean single scroll.

### 6a. Linked-issue context

If `pullRequest.linkedIssue` is present, a compact panel: the issue number and
title, and its `acceptanceCriteria` as a bulleted list, framed "What this PR was
supposed to do." This is reference context — it may be a collapsible
`Accordion`, collapsed on mobile, open on desktop. If `linkedIssue` is `null`,
**omit the section entirely** (a PR with no linked issue degrades gracefully —
PRD NFR "resilient"); do not show an empty panel.

### 6b. Changed files

The heart of the review. Render `changedFiles` as a list, one entry per file.
Each entry shows:
- the file `path` (monospace), a `Badge` for `changeKind` ("Added", "Modified",
  "Removed", "Renamed"), and the `+{additions} −{deletions}` counts;
- the **diff** for that file — the `hunks` rendered as a readable patch:
  monospace, addition lines tinted green, deletion lines tinted red, context
  lines neutral, each hunk's `header` shown as a separator;
- the **explanation** — `explanation` prose, plain language, placed so it is
  clearly tied to *this* file's diff (above the hunks, or in a side-by-side
  column on wide screens).

Each file entry may be a shadcn `Card` or a `Collapsible` section. A file with
a large diff may collapse its hunks behind a "Show diff" toggle, but the
**explanation prose is always visible** — the explanation is the product, the
raw patch is supporting detail. Every changed file in the PR has exactly one
entry (PRD FR-4 acceptance: "every changed file in the PR has an explanation").

### 6c. Core-logic explanation

A clearly headed section — "What this change does" — rendering
`coreLogicExplanation` as readable prose: the change as a whole, not file by
file. It references the actual diff (PRD FR-4). Give it generous space and
readable typography; it carries the same "AI-generated" framing as the rest of
the review.

### 6d. Risk analysis

The **Risk Analysis Panel** — its own spec, `docs/design/risk-analysis-panel.md`
— embedded here as a headed section ("Risks to watch"), rendering
`DiffReview.risks`. Each risk is tied to a specific changed file or hunk. See
that spec for the panel's full behaviour; this page only provides its slot and
its `risks` data.

### 6e. Test suggestions

A headed section — "Suggested tests" — rendering `testSuggestions` as a list.
Each `TestSuggestion` is `{ title: string; rationale: string; targetPath: string }`
— the suggestion title, a one-line rationale, and the file path it targets
(monospace badge). Each suggestion references behaviour the diff changed (PRD
user story acceptance). If `testSuggestions` is empty, show a quiet inline note
("No specific test suggestions for this change") rather than omitting the
heading silently.

### 6f. Understanding check

The **Understanding Check UI** — its own spec,
`docs/design/understanding-check.md` — embedded here as a headed section
("Check your understanding"), rendering `DiffReview.questions` and driving the
answer-and-score loop. It is a Client Component island: it displays each
question, collects the user's answers, and submits them via `gradeDiffReview`.
See that spec for the full question-display and answer-entry behaviour.

### 6g. Score & weak areas

The **Score / Weak Area UI** — its own spec, `docs/design/score-weak-area.md` —
embedded here as a headed section ("Your result"), rendering
`DiffReview.grading`. It is shown **only after grading**: when `grading` is
`null` it is absent and §6f's form is active; when `grading` is present the
graded score and weak-area breakdown are shown. The transition from the form to
the result is the close of the answer-and-score loop. See that spec for the
score and weak-area presentation.

Sections 6a–6g may be grouped into shadcn `Card`s or rendered as headed
`<section>`s in one column. The grounding sections (6b, 6c, 6d) and the
understanding loop (6f, 6g) must remain visually prominent — never hidden behind
closed accordions by default (the linked-issue context 6a and large individual
diffs are the only things that may collapse).

## 7. Input fields

The Diff Review page shell itself has **no input fields**. The only inputs on
the route are inside the embedded **Understanding Check UI** (§6f) — one answer
field per comprehension question, plus a submit control. Those are fully
specified in `docs/design/understanding-check.md` §7.

## 8. Primary actions

- **Read the review** — scroll/jump through the changed-file explanations, core
  logic, risks, and test suggestions. The main passive action.
- **View the PR on GitHub** — external link in the header.
- **Toggle a file's diff** — show/hide a large file's hunks (§6b).
- **Answer the comprehension questions** — the answer-and-score loop, in the
  embedded Understanding Check UI (§6f). The main forward action.
- **Submit answers for grading** — runs `gradeDiffReview`, producing the Score /
  Weak Area result (§6g).
- **Review the graded result** — read the score and weak areas after grading.

No create/edit/delete of the review itself — the review is generated by the M8
review call; the page presents it and runs the understanding loop over it.

## 9. Loading state

While `getDiffReviewById` runs, render a skeleton review layout via
`app/reviews/[id]/loading.tsx`: a header bar, a few changed-file placeholder
blocks (each a path bar + diff block + prose lines), a core-logic prose block, a
risk-list placeholder, and a question-list placeholder. Use shadcn `Skeleton`.
The data source is a local SQLite file, so loading is brief — but the state must
exist so the page never flashes empty.

The answer-and-score loop has its own in-progress state (the grading call is a
bounded LLM call that takes a few seconds) — that is specified in
`docs/design/understanding-check.md` §9, not here.

## 10. Empty state

A diff review always has content — a PR has at least one changed file, and the
review call always produces a core-logic explanation and at least one question
(PRD FR-3). So there is **no "empty review" state** for the page as a whole.
The partial states are:
- **No linked issue** — §6a is omitted (handled in §6a, not an empty state).
- **No test suggestions** — §6e shows a quiet inline note (handled in §6e).
- **Not yet answered** — `answers`/`grading` are `null`; the Understanding Check
  form is active and the Score / Weak Area section is absent. This is a normal
  state of the answer-and-score loop, not an empty state (§6f/§6g, §12).

If a list-valued field is unexpectedly empty, hide that section rather than
showing an empty heading.

## 11. Error state

- **Not found** — if `getDiffReviewById(id)` returns `null`, or `id` is not a
  valid integer, call Next.js `notFound()` and render
  `app/reviews/[id]/not-found.tsx`: heading "Review not found", a line
  explaining it does not exist, and a "Back to reviews" link.
- **Load failure** — if the data layer throws, the route `error.tsx` boundary
  renders a friendly error: heading "Couldn't load this review", a short
  explanation, and a "Try again" button (`reset()`). No raw stack trace or DB
  error.
- **Grading failure** — if the `gradeDiffReview` call fails (no API key, rate
  limit, network), it is handled inside the Understanding Check UI, not as a
  page error: the user's typed answers are preserved and a quiet "try again" is
  offered (see `docs/design/understanding-check.md` §11). The rest of the review
  stays fully visible.
- **Unresolved file reference** — if a `ChangedFileExplanation.path` or a risk's
  file reference does not resolve against the PR's changed-file set, render it
  as plain text with a quiet inline flag — never crash the page (PRD NFR
  "project-grounded").
- Not-found (expected: unknown id) and load-error (unexpected: data layer
  failed) are deliberately separate states with different copy.

## 12. Success state

- The page renders the review header, every changed-file explanation with its
  diff, the core-logic explanation, the embedded Risk Analysis Panel, the test
  suggestions, and the embedded Understanding Check — every field of §5 has a
  home in the layout.
- **Before answering** (`answers`/`grading` are `null`): the Understanding Check
  form (§6f) is active and the Score / Weak Area section (§6g) is absent.
- **After answering** (`answers`/`grading` populated): the Score / Weak Area UI
  (§6g) shows the graded score and weak-area breakdown; the header gains the
  "answered {updatedAt}" line. A returning user lands directly in this state.
- Success is otherwise implicit (content shown) — this is a read-and-do page,
  not a page with a confirmation banner; the graded result *is* the confirmation
  of the answer-and-score loop.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (the PR title); section headings descend
  in order (`<h2>` for the major sections, `<h3>` within) with no skipped
  levels. Use `<main>`, `<nav>` (back link, in-page section nav), and
  `<section>` landmarks. Multi-item fields (changed files, risks, test
  suggestions, questions, acceptance criteria) use `<ul>`/`<ol>`.
- **Diff rendering.** Addition/deletion lines must not convey meaning by color
  alone — pair the tint with a leading `+` / `−` glyph (and/or an `sr-only`
  "added" / "removed"). The patch is in a `<pre>`/monospace block with a
  programmatic label naming the file.
- **Reading order.** DOM order = visual order: header → linked issue → changed
  files → core logic → risks → tests → understanding check → result. Logical
  for a screen reader top to bottom.
- **Collapsibles.** "Show diff" toggles and the linked-issue accordion are real
  buttons with `aria-expanded`; collapsing a diff never hides the explanation
  prose.
- **AI-generated label.** The "AI-generated review" framing is real, announced
  text — not a color-only or icon-only signal.
- **External link.** The "View on GitHub" link uses `rel="noopener noreferrer"`
  and an accessible hint that it opens externally.
- **Loading state.** Skeletons are decorative and `aria-hidden`; the loading
  region carries `aria-busy="true"`.
- **Keyboard.** Full keyboard operability in logical order: the back link, the
  GitHub link, every collapsible toggle, the in-page nav links, and every
  control in the embedded Understanding Check are reachable; Enter/Space
  activate. Visible focus ring throughout.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes (the app
  uses `next-themes`). `changeKind` badges convey meaning by text, not color
  alone.
- **Targets.** Interactive targets are comfortably sized for pointer and touch.
- The embedded panels carry their own accessibility requirements — see §13 of
  the three sibling specs.

## 14. Acceptance criteria

- [ ] `/reviews/[id]` renders one stored diff review read from the typed M8
      data-access layer server-side — no client fetch, no API route.
- [ ] The **review header** shows the PR title, `repo`/PR number, an external
      "View on GitHub" link, and an honest "AI-generated review" label.
- [ ] **Every changed file** in the PR has an entry showing its `path`, a
      `changeKind` badge, the `+`/`−` counts, its diff hunks, and a
      plain-language explanation tied to that file.
- [ ] The **core-logic explanation** renders as a clearly headed prose section.
- [ ] The **Risk Analysis Panel** (sibling spec) is embedded and renders
      `DiffReview.risks`.
- [ ] The **test suggestions** render as a list, each with a title, rationale,
      and target path; an empty list shows a quiet note, not a silent gap.
- [ ] The **Understanding Check UI** (sibling spec) is embedded and drives the
      answer-and-score loop over `DiffReview.questions`.
- [ ] The **Score / Weak Area UI** (sibling spec) is embedded and shown only
      after grading — the page renders correctly both before answering
      (`answers`/`grading` null) and after (populated).
- [ ] A **linked issue**, when present, shows its number, title, and acceptance
      criteria; when absent the section is omitted (graceful degradation).
- [ ] **Loading** state shows a skeleton review layout.
- [ ] **Error** state: an unknown/invalid `id` shows a "not found" page with a
      back link; a load failure shows a friendly "Try again" error; a grading
      failure is handled inside the Understanding Check, not as a page error.
- [ ] The page reads as one product with the M2 Catalog, M3 Registry, and M4
      Recommendation pages — shared layout, spacing, and calm, content-first
      tone.
- [ ] Accessibility notes in §13 are satisfied (one `<h1>`, ordered headings,
      landmarks, diff not color-only, accessible collapsibles, announced states,
      AA contrast).
- [ ] Page spec is human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #115).
