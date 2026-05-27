# Page Spec: Issue Learning Workspace

Issue: #136 · Epic: `issue-based-learning-workspace` · PRD: `.claude/prds/issue-based-learning-workspace.md` (FR-1, FR-2, FR-3, FR-4, FR-6, FR-7, FR-10, FR-11)

This spec defines the **Issue Learning Workspace** page for Milestone 7. It is
the input to the Claude Design prompt
(`docs/design/ui-prompts/issue-learning-workspace.prompt.md`) and to the
integration task #138. It must be human-reviewed before the prompt is run.
(UI tool: **Claude Design** — see **ADR 0007**, which establishes Claude
Design as the only UI-generation tool used in this project.)

The Issue Learning Workspace is the **top-level page** of the four M7 UI
pieces. Its three siblings are nested inside it: the **Review Checklist UI**
(`docs/design/review-checklist.page-spec.md`), the **Understanding Questions
UI** (`docs/design/understanding-questions.page-spec.md`), and the **Challenge
Panel** (`docs/design/challenge-panel.page-spec.md`). All four share layout,
components, and tone with the M6 project-map pages and the M8 diff-review pages
so the whole app reads as one product. The four pieces are specified
separately so each is reviewable on its own, but they integrate into the
single route defined here.

The user reaches this page through the **per-repo Issues list** (R5, FR-11) —
its own spec under `docs/design/per-repo-issues-list.page-spec.md` (task #137);
no global cross-repo issues index in M7.

---

## 1. Page name

**Issue Learning Workspace** — a single-route page showing the **learning
unit** for one GitHub Issue (or local CCPM task) on the user's imported
repository: the restated goal, the related files, the concepts, the AI-agent
execution notes, the review checklist, the understanding questions, and the
challenge stub. From this page the user works the review-checklist loop and
the answer-and-score loop on a single issue.

## 2. User goal

> "An AI is about to write the code that closes this issue. Before I let it,
> show me what the issue is actually asking for in my repo, which files are in
> play, what I should be able to defend afterwards, and what I should verify
> in whatever diff the AI produces — grounded in this repo, not generic
> advice. Then test me on it so I know I can defend the change in an
> interview."

The user opens a learning unit for a specific issue, reads the restated goal
and the related files, studies the concepts and the AI-agent execution notes,
walks the review checklist, then answers the understanding questions and
receives a score and a weak-area breakdown.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She has
one or two AI-built portfolio projects she cannot confidently explain. She can
prompt an AI tool, run `pnpm`, and push to GitHub, but cannot justify a stack
or describe how an issue maps onto her code before the AI writes the diff.

Design implications:
- **Issue first, then the unit.** Mia may not have internalized the issue
  text. The restated goal sits at the very top, in plain language, grounded
  in the imported repo (not generic "your task is to add a feature" filler).
- **Grounded, not generic.** Every related file resolves to a real path in
  the M11 snapshot; every concept ties to a related file or an M6
  project-map node; every checklist item is concrete to this issue (FR-4).
  Generic CS-101 filler is a failure mode, not a feature.
- **Honest about AI.** The unit is itself AI-generated. The page carries a
  small, honest "AI-generated learning unit" label — on-thesis with ADR 0005:
  the coaching output is inspectable, not a black box.
- **Comprehension over completion.** The Review Checklist surfaces progress
  but **does not gate** the understanding-question score (R4) — see the
  Review Checklist spec for the normative wording.
- **No accounts, no setup.** M7 has no authentication; a learning unit is
  reachable by its URL. The imported repo and its issues come from M11.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the page shell;
Client Component islands for the two interactive loops (the Review Checklist
toggle state and the Understanding Questions answer-and-score loop — see §6
and the sibling specs).

| Route | Purpose | File |
|---|---|---|
| `/repos/[owner]/[repo]/issues/[issueRef]` | One learning unit for one issue on the imported repo | `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx` |

- `[owner]` and `[repo]` identify the imported repository (M11 repo identity).
- `[issueRef]` is the normalized issue reference (R1): either a GitHub Issue
  number (e.g. `123`) or a CCPM task identifier (e.g. `ccpm-130`). The
  data-access layer (task #135) resolves it to a single `learning_units` row
  keyed by repo + issue/task identifier.
- A loading UI (`loading.tsx`) and a not-found UI (`not-found.tsx`) accompany
  the route; an error boundary (`error.tsx`) covers it.
- The page is linkable and bookmarkable — a unit can be revisited; a
  returning user with answers already stored sees the graded result, not a
  blank form (§6f/§6g, §12).
- How a user *selects* an issue (the per-repo Issues list) is **out of scope
  for this spec** — task #137's per-repo Issues list page handles selection
  (FR-11, R5). This spec assumes the user arrives at the route for an
  already-created learning unit.

## 5. Data source / contract

The page is a **thin server-side view** over the typed M7
`learning_units` data-access layer (`@workspace/db`, task #135), the M6
`project_maps` data-access layer (shipped), and the M11 snapshot
data-access layer (shipped). No client-side fetching, no API route — Server
Components call the data layers directly (ADR 0006). The answer-and-score
loop and the checklist toggles post through server actions (see §6f, §6g,
and the sibling specs).

```ts
// M7 — the stored learning unit (task #135)
getLearningUnitByRef(
  repo: { owner: string; name: string },
  issueRef: string,
): Promise<LearningUnit | null>

// M6 — the project map for this snapshot, where present (read-only)
getProjectMapForRepo(repo: { owner: string; name: string }): Promise<ProjectMap | null>

// M11 — the imported-snapshot file set, used to annotate related files
getSnapshotFilePaths(repo: { owner: string; name: string }): Promise<string[]>

// Submitting the user's checklist state — server action wired by task #138
updateChecklistState(unitId: number, state: ChecklistState): Promise<LearningUnit>

// Submitting the user's answers — server action wired by task #138
gradeLearningUnit(unitId: number, answers: AnswerInput[]): Promise<LearningUnit>
```

`getLearningUnitByRef` returns `null` when no row matches — the page treats
`null` as not-found (§11).

### `LearningUnit` record shape — the M7 typed unit contract

This is the **single contract** all four M7 UI pieces render and that
integration task #138 must satisfy. The exact TypeScript lives in
`packages/db` (the schema is task #131, generation is task #133, grading is
task #134, the data-access layer is task #135); if the field names below
differ from the merged code at integration time, the merged code is
authoritative — but the *shape* is fixed by PRD FR-2 / FR-5 / FR-6 / FR-7 /
FR-8 and must not change without updating this spec.

A `LearningUnit` carries:

| Field | Type | Used by |
|---|---|---|
| `id` | `number` | row key |
| `repo` | `{ owner: string; name: string }` | §6 header — which repository |
| `issueRef` | `string` | URL key |
| `source` | `"github-issue" \| "ccpm-task"` | §6 header — the **source badge** (R1) |
| `issueNumber` | `string` | §6 header — e.g. `#123` for a GitHub issue, `ccpm/130` for a CCPM task |
| `issueTitle` | `string` | §6 header — the original issue title |
| `issueUrl` | `string \| null` | §6 header — link out to GitHub (null for CCPM tasks) |
| `restatedGoal` | `string` | §6a — the restated goal in this repo's context |
| `relatedFiles` | `RelatedFile[]` | §6b — related files with M6 role annotations |
| `concepts` | `Concept[]` | §6c — concepts tied to files / project-map nodes |
| `aiAgentNotes` | `string` | §6d — how an AI agent would plausibly approach this issue |
| `reviewChecklist` | `ChecklistItem[]` | §6e — the Review Checklist (see sibling spec) |
| `checklistState` | `ChecklistState` | §6e — user toggle state (see sibling spec) |
| `questions` | `Question[]` | §6f — the Understanding Questions (see sibling spec) |
| `userAnswers` | `AnswerRecord[] \| null` | §6f/§6g — the user's stored answers; `null` until answered |
| `score` | `Score \| null` | §6g — the Score / Weak Area block (see sibling spec); `null` until graded |
| `weakAreas` | `WeakArea[] \| null` | §6g — the weak-area breakdown; `null` until graded |
| `challengeConcept` | `string` | §6h — the Challenge Panel stub (see sibling spec); FR-7, R3 |
| `challengeType` | `string` | §6h — the Challenge Panel stub (see sibling spec); FR-7, R3 |
| `createdAt` / `updatedAt` | `Date` | §6 header — "generated on" / "answered on" |

`RelatedFile` (one per file the unit references — PRD FR-4):

| Field | Type | Use |
|---|---|---|
| `path` | `string` | the real file path in the imported snapshot |
| `role` | `string \| null` | the M6 role annotation when present, e.g. "API route"; `null` when no M6 map node matches |
| `note` | `string` | one-line plain-language reason this file is in play for this issue |

`Concept`:

| Field | Type | Use |
|---|---|---|
| `name` | `string` | the concept name, e.g. "Rate limiting", "Database transactions" |
| `explanation` | `string` | one or two sentences in plain language |
| `tieToFile` | `string \| null` | path of a related file the concept maps to |
| `tieToMapNode` | `string \| null` | identifier of an M6 project-map node the concept maps to |

> **At least one of `tieToFile` / `tieToMapNode` is non-null** per FR-4 — the
> integrity check rejects unresolved concept references at generation time
> (task #133). If both are unexpectedly `null` at render time, the concept is
> shown without an anchor — never crash.

`ChecklistItem`, `ChecklistState`, `Question`, `AnswerRecord`, `AnswerInput`,
`Score`, and `WeakArea` are defined in the sibling specs
(`review-checklist.page-spec.md`, `understanding-questions.page-spec.md`) —
they are the contracts those components render. They are summarized here only
where this page composes them.

> **`userAnswers` and `score`/`weakAreas` are nullable together.** A freshly
> generated unit has `questions` but no `userAnswers` and no `score`. After
> the user completes the answer-and-score loop (sibling spec
> `understanding-questions.page-spec.md`), all three are populated. The page
> must render correctly in both states — unanswered (the Understanding
> Questions form is active) and answered/graded (the Score / Weak Area block
> is shown). This is the answer-and-score loop, end to end.

The unit is guaranteed project-grounded: every `RelatedFile.path` resolves to
a real path in the M11 snapshot's file set; every `Concept` ties to a related
file or an M6 project-map node; every `ChecklistItem` is concrete to this
issue (the M7 integrity check, task #135, FR-4). If a reference unexpectedly
fails to resolve at render time, the page renders it as plain text and flags
it quietly rather than crashing.

## 6. Page sections

Top to bottom, single readable column (comfortable max width):

1. **Back link** — "← Back to issues" (to the per-repo Issues list — task
   #137; this spec does not design that index).
2. **Unit header** — the `issueTitle` as an `<h1>`; a muted line
   `{repo.owner}/{repo.name} · {issueNumber}` with an external link "View on
   GitHub →" (`issueUrl`, new tab, `rel="noopener noreferrer"`) **only when
   `issueUrl` is non-null** (CCPM tasks have no GitHub URL — degrade
   gracefully); a **source badge** showing `source` ("GitHub issue" or
   "CCPM task") — calm coloring, meaning carried by the text (R1); a muted
   "Generated {createdAt}" line (and "· answered {updatedAt}" once graded);
   and a small, honest **"AI-generated learning unit"** label (real text,
   not an icon-only signal — ADR 0005).
3. **In-page section nav (optional)** — for a long unit, a compact set of
   anchor links — "Goal", "Files", "Concepts", "AI-agent notes", "Review
   checklist", "Understanding questions", "Challenge" — so the user can
   jump between sections. Optional; if omitted the page is still a clean
   single scroll.

### 6a. Restated goal

A clearly headed section — "What this issue is asking for" — rendering
`restatedGoal` as readable prose: the issue restated in the user's own
project context (PRD US-1 acceptance). Generous spacing, plain language.
Carries the same "AI-generated" framing as the rest of the unit.

### 6b. Related files

The grounding for everything below. Render `relatedFiles` as a list (one
entry per file). Each entry shows:
- the `path` (monospace), prominent;
- the `role` as a small badge **when non-null** (e.g. "API route", "Schema",
  "Test harness") — sourced from the M6 project map (PRD US-2 acceptance);
- the `note` — one-line plain-language reason this file is in play.

The list reads as the **spine** of the unit: every concept, every checklist
item, and many questions reference a path that appears here. If
`relatedFiles` is empty (genuinely no related files known) show a quiet
inline note ("No related files identified for this issue") rather than a
bare heading — the unit can still be useful for goal restatement and
concept teaching.

### 6c. Concepts

A clearly headed section — "Concepts to understand" — rendering `concepts`
as a list, one entry per `Concept`. Each entry shows:
- the `name` as the entry heading;
- the `explanation` prose, plain language;
- when `tieToFile` is non-null, the file path as a monospace chip, styled
  as an **in-page anchor** to that file's entry in §6b;
- when `tieToMapNode` is non-null, a small "Project map →" link out to the
  M6 project-map page anchored at the relevant node.

Generic CS-101 filler is a failure mode (PRD FR-4). The integrity check
rejects concepts with no tie at generation time; the UI surfaces the tie
visibly so the grounding is **inspectable**, not hidden.

### 6d. AI-agent execution notes

A clearly headed section — "How an AI agent would approach this" — rendering
`aiAgentNotes` as readable prose: which files the agent would likely change,
which functions, what the diff probably looks like. Grounded in the
`relatedFiles` list, not a generic "the agent will write code" sentence
(PRD US-4 acceptance). Carries the "AI-generated" framing.

### 6e. Review checklist

The **Review Checklist UI** — its own spec,
`docs/design/review-checklist.page-spec.md` — embedded here as a headed
section ("Review checklist") rendering `reviewChecklist` and
`checklistState`. The user can toggle items; state persists via
`updateChecklistState`. The section surfaces completion as a **progress
indicator only — it does NOT gate the understanding-question score**
(R4, FR-6). See that spec for the full behaviour; this page only provides
its slot and its data.

### 6f. Understanding questions

The **Understanding Questions UI** — its own spec,
`docs/design/understanding-questions.page-spec.md` — embedded here as a
headed section ("Check your understanding"), rendering `questions` and
driving the answer-and-score loop. It is a Client Component island: it
displays each question, collects the user's answers, and submits them via
`gradeLearningUnit`. **Its shape mirrors M8's Score / Weak Area UI** per
the PRD's NFR Fair grading — see that spec for the full question-display
and answer-entry behaviour.

### 6g. Score & weak areas

Rendered as the result half of the Understanding Questions UI (sibling
spec) — embedded here as a headed sub-section ("Your result"), showing
`score` and `weakAreas` only after grading. When `score`/`weakAreas` are
`null` it is absent and §6f's form is active; when populated the graded
score and weak-area breakdown are shown. The transition from the form to
the result is the close of the answer-and-score loop. **The shape mirrors
M8's Score / Weak Area UI** (per the PRD's NFR Fair grading and R6
"strictly per-unit scoring") so M7 and M8 produce one comprehension-grading
pattern in the product. See `understanding-questions.page-spec.md` §6 for
the full presentation.

### 6h. Challenge

The **Challenge Panel** — its own spec,
`docs/design/challenge-panel.page-spec.md` — embedded here as a headed
section ("Challenge"), rendering `challengeConcept` and `challengeType`
read-only. **Per FR-7 and R3 the panel is a stub** — it shows an explicit
"deferred to M9" message and does **not** run, grade, or claim to resolve
a challenge. See that spec for the full behaviour; this page only provides
its slot and its (minimal) data.

Sections 6a–6h may be grouped into shadcn `Card`s or rendered as headed
`<section>`s in one column. The grounding sections (6a, 6b, 6c, 6d) and
the understanding loop (6f, 6g) must remain visually prominent — never
hidden behind closed accordions by default. The Challenge panel (6h) is
visually subdued so it does not over-promise (it is a stub).

## 7. Input fields

The Issue Learning Workspace page shell itself has **no input fields**.
The inputs on the route live inside the embedded sub-UIs:
- the **Review Checklist UI** (§6e) — one toggle per checklist item, fully
  specified in `docs/design/review-checklist.page-spec.md` §7;
- the **Understanding Questions UI** (§6f) — one answer field per question
  plus a submit control, fully specified in
  `docs/design/understanding-questions.page-spec.md` §7.

## 8. Primary actions

- **Read the unit** — scroll/jump through the restated goal, related files,
  concepts, AI-agent notes, checklist, questions, and challenge stub. The
  main passive action.
- **View the issue on GitHub** — external link in the header, only when
  `issueUrl` is non-null.
- **Jump to a related file** — from a concept's `tieToFile` chip or a
  question's `fileRefs` chip to that file's entry in §6b. In-page anchors.
- **Toggle a checklist item** — the main forward action on the checklist
  loop; specified in the Review Checklist sibling spec.
- **Answer the understanding questions** — the answer-and-score loop, in
  the embedded Understanding Questions UI (§6f). The main forward action
  on comprehension.
- **Submit answers for grading** — runs `gradeLearningUnit`, producing the
  Score / Weak Area result (§6g).
- **Review the graded result** — read the score and weak areas after
  grading.

No create/edit/delete of the unit itself — the unit is generated by the M7
generation call (task #133) and the data layer (task #135); the page
presents it and runs the two loops over it. The **Challenge Panel
intentionally has no run/grade action** — that is M9 (FR-7, R3).

## 9. Loading state

While `getLearningUnitByRef` runs, render a skeleton unit layout via
`app/repos/[owner]/[repo]/issues/[issueRef]/loading.tsx`: a header bar, a
restated-goal prose block, a related-files placeholder list (a few path
bars + note lines), a concepts placeholder list, an AI-agent-notes prose
block, a checklist placeholder, a question-list placeholder, and a
challenge-panel placeholder. Use shadcn `Skeleton`. The data source is a
local SQLite file plus M6/M11 reads, so loading is brief — but the state
must exist so the page never flashes empty.

The answer-and-score loop has its own in-progress state (the grading call
is a bounded LLM call that takes a few seconds) — that is specified in
`docs/design/understanding-questions.page-spec.md` §9, not here. The
checklist toggle has no loading shell — it optimistically updates and
persists via server action.

## 10. Empty state

A learning unit always has content — an issue has at least a title, and
the generation call always produces a restated goal, at least one concept,
AI-agent notes, at least one checklist item, at least one question, and
the challenge stub fields (PRD FR-2, FR-3). So there is **no "empty unit"
state** for the page as a whole. The partial states are:
- **No issue URL** — §6 header omits the external "View on GitHub" link
  (CCPM-task source — graceful degradation).
- **No related files** — §6b shows a quiet inline note (handled in §6b,
  not an empty state). This is the PRD's "resilient" NFR: an issue that
  references no files in the snapshot still produces a usable unit.
- **No M6 project map for the repo** — `RelatedFile.role` and
  `Concept.tieToMapNode` are silently `null` (no "project map →" link is
  shown); the unit still renders with grounding from related files alone.
  This is the PRD's "resilient" NFR.
- **Not yet answered** — `userAnswers`/`score`/`weakAreas` are `null`; the
  Understanding Questions form is active and the Score / Weak Area block
  is absent. Normal state of the answer-and-score loop, not an empty
  state (§6f/§6g, §12).

If a list-valued field is unexpectedly empty, hide that section rather
than showing an empty heading — except §6b (related files), which gets a
quiet "no related files" note so the absence is honest.

## 11. Error state

- **Not found** — if `getLearningUnitByRef` returns `null`, or
  `[issueRef]` is malformed, call Next.js `notFound()` and render
  `not-found.tsx`: heading "Learning unit not found", a line explaining
  it does not exist, and a "Back to issues" link.
- **Load failure** — if the data layer throws, the route `error.tsx`
  boundary renders a friendly error: heading "Couldn't load this learning
  unit", a short explanation, and a "Try again" button (`reset()`). No
  raw stack trace or DB error.
- **Checklist persistence failure** — handled inside the Review Checklist
  UI, not as a page error: the toggle reverts and a calm inline message
  appears; the rest of the unit stays fully visible. See
  `docs/design/review-checklist.page-spec.md` §11.
- **Grading failure** — handled inside the Understanding Questions UI,
  not as a page error: the user's typed answers are preserved and a quiet
  "try again" is offered. See
  `docs/design/understanding-questions.page-spec.md` §11.
- **Unresolved file reference** — if a `RelatedFile.path`, a
  `Concept.tieToFile`, or a question's `fileRefs` does not resolve against
  the M11 snapshot file set, render it as plain text with a quiet inline
  flag — never crash the page (PRD NFR "project-grounded"). The M7
  integrity check (task #135) should have rejected such a unit at
  generation, so a runtime occurrence is defensive only.
- Not-found (expected: unknown ref) and load-error (unexpected: data
  layer failed) are deliberately separate states with different copy.

## 12. Success state

- The page renders the unit header (with source badge), the restated goal,
  every related file with its role and note, every concept with its tie,
  the AI-agent execution notes, the embedded Review Checklist, the
  embedded Understanding Questions, and the embedded Challenge Panel —
  every field of §5 has a home in the layout.
- **Before answering** (`userAnswers`/`score`/`weakAreas` are `null`): the
  Understanding Questions form (§6f) is active and the Score / Weak Area
  block (§6g) is absent. The checklist state may be partially populated
  independently (R4 — checklist does not gate the score).
- **After answering** (`userAnswers`/`score`/`weakAreas` populated): the
  Score / Weak Area block (§6g) shows the graded score and weak-area
  breakdown; the header gains the "answered {updatedAt}" line. A
  returning user lands directly in this state.
- Success is otherwise implicit (content shown) — this is a read-and-do
  page, not a page with a confirmation banner; the graded result *is* the
  confirmation of the answer-and-score loop.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (the issue title); section
  headings descend in order (`<h2>` for the major sections, `<h3>` within)
  with no skipped levels. Use `<main>`, `<nav>` (back link, in-page
  section nav), and `<section>` landmarks. Multi-item fields (related
  files, concepts, checklist items, questions) use `<ul>`/`<ol>`.
- **Source badge.** The `source` badge ("GitHub issue" / "CCPM task")
  conveys meaning by text, not color alone — and is announced.
- **Reading order.** DOM order = visual order: header → goal → files →
  concepts → AI-agent notes → checklist → questions → result → challenge.
  Logical for a screen reader top to bottom.
- **Anchors.** In-page anchors (concept tie-to-file, question file-ref
  chips, in-page section nav) are keyboard-operable with visible focus
  rings; accessible names include the target ("Jump to changes in
  `apps/web/lib/foo.ts`"); unresolved references are plain text, not
  dead links.
- **External link.** The "View on GitHub" link, when shown, uses
  `rel="noopener noreferrer"` and an accessible hint that it opens
  externally.
- **AI-generated label.** The "AI-generated learning unit" framing is
  real, announced text — not a color-only or icon-only signal.
- **Loading state.** Skeletons are decorative and `aria-hidden`; the
  loading region carries `aria-busy="true"`.
- **Keyboard.** Full keyboard operability in logical order: the back
  link, the GitHub link, every in-page anchor, every checklist toggle,
  and every control in the embedded Understanding Questions are
  reachable; Enter/Space activate. Visible focus ring throughout.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes
  (the app uses `next-themes`). The source badge, role badges, and
  verdict badges convey meaning by text, not color alone.
- **Targets.** Interactive targets are comfortably sized for pointer and
  touch.
- The embedded panels carry their own accessibility requirements — see
  §13 of the three sibling specs.

## 14. What this page does not do

- It **does not import repositories** — that is M11 (PRD "Out of Scope").
- It **does not re-derive the project map** — it reads M6's
  `project_maps` and degrades gracefully when no map exists (PRD
  "Resilient", R5).
- It **does not write to GitHub** — read-only per ADR 0009 (PRD "Out of
  Scope").
- It **does not select which issue to teach** — the per-repo Issues list
  (task #137, FR-11, R5) handles selection.
- It **does not run, grade, or resolve the challenge** — that is M9
  (FR-7, R3). The Challenge Panel renders the stub and an explicit
  "deferred to M9" message; see the Challenge Panel spec.
- It **does not gate the score on checklist completion** — R4
  ("comprehension over completion"). The checklist surfaces progress
  only; see the Review Checklist spec.
- It **does not show a per-repo or cross-repo aggregate score** — R6
  ("strictly per-unit scoring"). M10 owns any rollup.
- It **does not pre-allocate M9 challenge fields** — R3. M7 stores only
  `challengeConcept` and `challengeType`; M9 will add its full schema in
  its own migration.

## 15. Acceptance criteria

- [ ] `/repos/[owner]/[repo]/issues/[issueRef]` renders one stored
      learning unit read from the typed M7 data-access layer server-side
      — no client fetch, no API route.
- [ ] The **unit header** shows the issue title, `repo`/issue number, a
      **source badge** ("GitHub issue" or "CCPM task"; R1), an external
      "View on GitHub" link when `issueUrl` is non-null (omitted for
      CCPM tasks — graceful degradation), and an honest "AI-generated
      learning unit" label.
- [ ] The **restated goal** renders as a clearly headed prose section
      grounded in the imported repo (PRD US-1).
- [ ] **Every related file** in `relatedFiles` has an entry showing its
      `path`, its `role` badge (when present, sourced from M6), and its
      one-line `note`; an empty list shows a quiet "no related files"
      note (PRD "Resilient").
- [ ] **Every concept** shows its `name`, `explanation`, and a visible
      tie — to a related file (in-page anchor) or to an M6 project-map
      node (out-link to the M6 page). No concept without a tie is
      generated (FR-4); at render time, missing ties degrade gracefully.
- [ ] The **AI-agent execution notes** render as a clearly headed prose
      section grounded in `relatedFiles` (PRD US-4).
- [ ] The **Review Checklist UI** (sibling spec) is embedded and renders
      `reviewChecklist` + `checklistState` — **progress indicator only,
      no gating** (R4, FR-6).
- [ ] The **Understanding Questions UI** (sibling spec) is embedded and
      drives the answer-and-score loop over `questions`; on grading the
      Score / Weak Area block renders **mirroring M8's shape** (NFR
      Fair grading).
- [ ] The **Challenge Panel** (sibling spec) is embedded read-only,
      renders `challengeConcept` + `challengeType`, and shows an
      explicit "deferred to M9" message (FR-7, R3) — it does not run,
      grade, or claim to resolve a challenge.
- [ ] The page renders correctly both **before answering**
      (`userAnswers`/`score`/`weakAreas` null) and **after** (populated).
- [ ] **Loading** state shows a skeleton unit layout.
- [ ] **Error** state: an unknown/invalid `issueRef` shows a "not found"
      page with a back link; a load failure shows a friendly "Try again"
      error; a grading failure is handled inside the Understanding
      Questions UI, not as a page error.
- [ ] The page reads as one product with the M6 project-map pages and
      the M8 diff-review pages — shared layout, spacing, and calm,
      content-first tone.
- [ ] Accessibility notes in §13 are satisfied (one `<h1>`, ordered
      headings, landmarks, source badge not color-only, accessible
      anchors, announced states, AA contrast).
- [ ] The page is generated through **Claude Design (ADR 0007)** — the
      only UI-generation tool used in this project. Page Spec is
      human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #136).
