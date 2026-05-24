# Page Spec: Review Checklist UI

Issue: #136 · Epic: `issue-based-learning-workspace` · PRD: `.claude/prds/issue-based-learning-workspace.md` (FR-6, FR-8, FR-10)

This spec defines the **Review Checklist UI** for Milestone 7. It is the input
to the Claude Design prompt
(`docs/design/ui-prompts/review-checklist.prompt.md`) and to the integration
task #138. It must be human-reviewed before the prompt is run. (UI tool:
**Claude Design** — see **ADR 0007**, which establishes Claude Design as the
only UI-generation tool used in this project.)

The Review Checklist UI is **not a standalone route** — it is the interactive
component embedded in the **Issue Learning Workspace** page
(`docs/design/issue-learning-workspace.page-spec.md` §6e) at route
`/repos/[owner]/[repo]/issues/[issueRef]`. It shares layout, components, and
tone with the rest of M7 and the M6 / M8 pages so the whole app reads as one
product.

---

## 1. Page name

**Review Checklist UI** — the embedded review-checklist component within the
Issue Learning Workspace page: it displays the per-unit review checklist
generated for the issue, lets the user toggle each item as done / not done,
and surfaces completion as a **progress indicator**.

## 2. User goal

> "An AI is going to write the code that closes this issue. Give me a
> concrete list of things to verify in whatever diff it produces — tied to
> *my* files, not generic 'code review best practices' — so I can review the
> AI's output instead of rubber-stamping it. Let me check items off as I
> work, and show me how far I've got, but don't penalize me for not finishing
> — I want to be tested on comprehension, not on whether I clicked every
> checkbox."

The user reads each checklist item, ticks the ones they have verified, and
sees a calm progress indicator — without the checklist ever blocking the
understanding-question score.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She
tends to merge AI-generated changes without inspecting them — the checklist
is the surface that operationalizes "review AI work instead of passively
accepting it" (PRD user story).

Design implications:
- **Concrete, not generic.** Each checklist item references a real file in
  the unit or a real concept from the unit — e.g. "verify
  `apps/web/lib/foo.ts` still exports `bar`" — not a generic code-review
  platitude (PRD FR-4, US-5 acceptance). A generic checklist would be the
  exact "checkbox theater" the product rejects.
- **Progress, not gating.** **R4 normative:** completion is a **progress
  indicator only** and does **NOT gate** access to the
  understanding-question score or any other part of the unit. The framing
  is **"comprehension over completion"** (`product.md`) — the checklist
  surfaces effort, the understanding questions surface comprehension, and
  the two are independent surfaces by design. (See §6 framing.)
- **Honest about AI.** The checklist itself is AI-generated coaching
  guidance — the component inherits the Issue Learning Workspace page's
  "AI-generated learning unit" framing (it does not need its own separate
  label).
- **Honest effort, no penalty.** Toggling is non-destructive — the user
  can untick an item. There is no submit; the state persists per toggle.
  There is no "you missed N items" warning anywhere.
- **No accounts, no setup.** M7 has no authentication; checklist state
  persists by unit id.

## 4. Route(s)

**No route of its own.** The component is rendered inside
`apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx` (the Issue
Learning Workspace page) as the §6e "Review checklist" section. It is a
**Client Component island** (it holds toggle state and persists it) —
suggested home: `apps/web/components/learning/review-checklist.tsx`. The
toggle persistence goes through a **server action** (no API route —
ADR 0006). Final placement is the integrator's call (task #138).

## 5. Data source / contract

The component **receives the checklist and its current state as props** —
it does no fetching. Its parent (the Issue Learning Workspace page) loads
the `LearningUnit` via the M7 data-access layer (`getLearningUnitByRef`,
task #135) and passes the relevant slice down.

```ts
interface ReviewChecklistProps {
  unitId: number
  reviewChecklist: ChecklistItem[]
  // The user's current per-item state. May be empty on a fresh unit (no
  // items ticked yet) — the component then renders every item unticked.
  checklistState: ChecklistState
  // For mapping a checklist item back to the related files it cites, so
  // file references can be in-page anchors into Issue Learning Workspace
  // §6b.
  relatedFilePaths: string[]
}

// The toggle path — a server action wired by the integrator (task #138).
// It calls the M7 data-access layer (task #135), which updates the
// learning_units.checklist_state JSON column (FR-6, FR-8).
updateChecklistState(
  unitId: number,
  state: ChecklistState,
): Promise<LearningUnit>
```

### Typed contracts the component renders and produces

These are produced by the M7 generation call (`ChecklistItem`, task #133)
and updated by the M7 data-access layer (`ChecklistState`, task #135);
they are part of the `LearningUnit` contract
(`docs/design/issue-learning-workspace.page-spec.md` §5). The exact
TypeScript lives in `packages/db` (under the `learning-units/` module);
if the merged code differs at integration time the merged code is
authoritative, but the shape is fixed by PRD FR-2 / FR-6 / FR-8 and must
not change without updating this spec.

**`ChecklistItem`** — one generated review-checklist item:

| Field | Type | Use |
|---|---|---|
| `id` | `string` | stable key; ties a state entry to its item |
| `text` | `string` | the item text — concrete, references this issue's files/concepts |
| `fileRefs` | `string[]` | related-file paths the item cites; may be empty |
| `conceptName` | `string \| null` | the concept this item ties to (matches a `Concept.name` in §6c of the parent); may be `null` |

**`ChecklistState`** — the user's per-item state, persisted as a JSON
column on `learning_units` (R2, FR-6, FR-8):

| Field | Type | Use |
|---|---|---|
| `items` | `Record<string, ChecklistEntry>` | keyed by `ChecklistItem.id` |

**`ChecklistEntry`** — one user toggle:

| Field | Type | Use |
|---|---|---|
| `done` | `boolean` | whether the user has ticked this item |
| `toggledAt` | `Date` | when the user last toggled it |

> **R4 normative — the contract surface.** `ChecklistState` lives on
> `learning_units.checklist_state` as a JSON column and is **never** an
> input to the grading call (task #134). The grading call reads
> `learning_units.questions` and the user's `userAnswers`; it has **no
> dependency** on `checklistState`. This is the data-shape proof of the
> "no gating" rule (R4, FR-6) — the two surfaces are independent at the
> persistence layer, not just at the UI layer.

`relatedFilePaths` is the union of `RelatedFile.path` from the parent
unit's `relatedFiles`; it is used so a checklist item's `fileRefs` chip
can be rendered as an in-page anchor to §6b of the parent — and so an
unresolved reference renders as plain text instead of a dead link.

> **Optimistic, persisted, non-blocking.** Toggling an item updates the
> local view immediately; the server action persists the new
> `ChecklistState`; on failure the toggle reverts and a quiet inline
> message appears (§11). There is no submit button — each toggle is its
> own commit.

## 6. Page sections

The component is a single headed section within the Issue Learning
Workspace page. Top to bottom:

1. **Section header** — heading "Review checklist" and a one-line
   description "Verify the AI's output against these checks — tied to the
   files this issue touches. **Ticking items tracks your progress; it
   does not change your understanding-question score.**" The second
   sentence is the **explicit R4 surfacing** ("comprehension over
   completion"). A short, honest note that the checklist is AI-generated
   coaching guidance.
2. **Progress indicator** — a calm "Checked 2 of 5" counter beside the
   header (and optionally a quiet progress bar — supportive only, never
   a pass/fail color block). No "complete!" celebration when all items
   are ticked — completion is informational. **No "you must complete
   this before…" copy anywhere** (R4).
3. **Checklist list** — `reviewChecklist` rendered as a list, one
   **checklist row** per `ChecklistItem`. Each row shows:
   - a **checkbox** (the toggle) labelled by the item `text`;
   - the item `text` — concrete prose;
   - when `fileRefs` is non-empty, the referenced file path(s) as
     monospace chips, each an in-page anchor to that file's entry in the
     Issue Learning Workspace §6b related-files section — so the user
     can connect the check to the code;
   - when `conceptName` is non-null, a small tag linking back to the
     concept in §6c.

Rows are **not collapsible by default** — the items must be visible so
the user can scan them. A row may carry a quiet "ticked {toggledAt}"
caption when `done` is true, supportive only.

## 7. Input fields

One **checkbox** per `ChecklistItem` — the only input on this component.

| Input | Behaviour |
|---|---|
| Checkbox (one per item) | A shadcn `Checkbox`. Toggling persists immediately via `updateChecklistState`; the toggle is optimistic and reverts on failure (§11). There is **no submit button** — each toggle commits independently. The checkbox is labelled by its item `text` (programmatically associated). |

- Toggling is **fully reversible** — the user can untick an item; there
  is no penalty for changing their mind.
- There is no "tick all" or "clear all" control — each item is its own
  decision.
- **The checklist never blocks any other UI on the unit** (R4) — the
  Understanding Questions form (§6f of the parent) is always available,
  whether the checklist is empty, half-ticked, or fully ticked.

## 8. Primary actions

- **Tick / untick an item** — the core activity. Persists immediately.
- **Jump to a referenced file** — click an item's `fileRefs` chip to
  scroll to that file's related-file entry in the Issue Learning
  Workspace page (§6b). An in-page anchor.
- **Jump to a tied concept** — click an item's `conceptName` tag to
  scroll to that concept's entry in §6c of the parent. An in-page
  anchor.

No create/edit/delete of checklist items — items are generated by the M7
generation call (task #133) and are stable for the unit's lifetime.

## 9. Loading state

- **On first render** — the component renders immediately from its props;
  there is no fetch, so no skeleton. (The route-level skeleton, including
  a checklist placeholder, is the Issue Learning Workspace page's
  `loading.tsx` — `docs/design/issue-learning-workspace.page-spec.md`
  §9.)
- **During toggle persistence** — the persistence call is fast (a local
  SQLite write). The toggle is **optimistic** — the checkbox flips
  immediately, no spinner — and the section does not lock. A row may
  carry a very subtle in-flight indicator (e.g. a small dot) but the rest
  of the checklist remains fully interactive (R4 — the checklist is
  non-blocking by design, even of itself).

## 10. Empty state

The M7 generation call always produces at least one checklist item that
is concrete to the issue (PRD FR-3, FR-4) — generic filler is rejected
by the integrity check. So `reviewChecklist` is non-empty in normal
operation; there is no data-driven empty state.

The "nothing ticked yet" state **is** the default initial render (every
checkbox off, "Checked 0 of N") — not a special empty screen. This is
the expected starting state and must look calm — no "get started!" CTA.

Defensive case: if `reviewChecklist` is unexpectedly empty, render the
section header with a quiet inline note ("No review-checklist items
were generated for this unit.") instead of a bare heading or a broken
form.

## 11. Error state

- **Persistence failure** — if `updateChecklistState` fails (DB
  unavailable, disk write error):
  - **revert** the optimistic toggle so the visible state matches what
    actually persisted;
  - show a calm inline message beside the row: a small text "Couldn't
    save — try again" with a **"Try again"** affordance that re-runs
    the same toggle;
  - never lose state for **other** rows; never blow up the rest of the
    unit.
- **Load failure** — a failure to load the `LearningUnit` itself is
  handled by the Issue Learning Workspace page's route `error.tsx`
  boundary, not here
  (`docs/design/issue-learning-workspace.page-spec.md` §11).
- **Unresolved file reference** — if a `ChecklistItem.fileRef` does not
  appear in `relatedFilePaths`, render it as plain monospace text
  without an anchor — never a dead link, never a crash (PRD NFR
  "project-grounded"). The M7 integrity check (task #135) should have
  rejected such an item at generation; runtime occurrence is defensive
  only.

There is **no "validation" error state** — toggling can never produce a
validation failure. Blank state is a valid state.

## 12. Success state

- **Active checklist** — every item renders with its text, file
  references, concept tag, and checkbox; the progress counter is
  accurate; toggling persists.
- **Fully ticked** — when every item is `done`, the progress counter
  shows "Checked N of N" — but **no other UI changes** (R4): no
  unlocked sections, no congratulatory banner, no change to the
  Understanding Questions form or score. Completion is informational.
- **Returning user** — `checklistState` is populated; the component
  renders the user's previous ticks intact.
- Success is otherwise implicit (state shown) — this is a track-as-you-go
  surface, not a page with a confirmation banner.

## 13. Accessibility notes

- **Semantics & headings.** The section has one heading ("Review
  checklist") at the level the parent page assigns it (an `<h2>`); the
  checklist is a `<ul>`. No skipped heading levels. Each row has a
  programmatic grouping so its checkbox, text, file chips, and concept
  tag are associated.
- **Checkbox labels.** Every checkbox has its item `text` as a
  programmatically associated label (via `<label htmlFor>` or
  `aria-labelledby`).
- **Toggle state announced.** The checked/unchecked state is announced;
  visible state never relies on color alone (a `<Checkbox>` glyph and
  the row styling carry the state).
- **Progress counter.** "Checked 2 of 5" is real text, accessible to
  screen readers; the optional progress bar is `aria-hidden` (the text
  carries the meaning) or has a programmatic value.
- **File-reference chips.** Each `fileRefs` chip is a keyboard-operable
  in-page anchor with an accessible name including the path ("Jump to
  file `apps/web/lib/foo.ts`"); visible focus ring.
- **Persistence-failure message.** The "Couldn't save — try again"
  message is a real, announced `aria-live` region — real text, not a
  color-only signal — and the "Try again" affordance is a real button.
- **Keyboard.** Full keyboard operability in logical (DOM = visual)
  order: every checkbox, every file-reference chip, every concept tag,
  every "Try again" affordance is reachable; Space toggles a checkbox;
  Enter activates anchors and buttons. Visible focus ring throughout.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes
  (the app uses `next-themes`). The progress counter conveys meaning by
  text, not color alone.
- **Targets.** Checkboxes, chips, tags, and buttons are comfortably
  sized for pointer and touch.

## 14. What this page does not do

- It **does not gate the understanding-question score** (R4, FR-6 —
  *normative*). The checklist surfaces completion as a progress
  indicator only; the Understanding Questions form (§6f of the parent)
  is always available regardless of checklist state, and the grading
  call (task #134) has no dependency on `checklistState`. This is
  **"comprehension over completion"** in `product.md`'s words — the
  checklist tracks effort, the questions test understanding, and the
  two surfaces are independent by design.
- It **does not produce a "completion score"** — there is no aggregate
  on the checklist itself; the only summary is the calm "Checked N of
  M" progress counter.
- It **does not pre-allocate spaced-repetition memory** — that is
  closer to M10 (PRD "Out of Scope").
- It **does not write to GitHub** — read-only per ADR 0009 (PRD "Out
  of Scope").
- It **does not let the user create or edit checklist items** — the
  items are generated by the M7 generation call (task #133) and are
  stable for the unit's lifetime.
- It **does not aggregate across units or across repos** — strictly
  per-unit (R6); M10 owns any rollup (PRD "Out of Scope").

## 15. Acceptance criteria

- [ ] The component renders **every** `ChecklistItem` in
      `reviewChecklist`, each showing its `text`, a checkbox, any
      `fileRefs` as in-page anchor chips, and the `conceptName` tag
      when present.
- [ ] Toggling a checkbox persists immediately via
      `updateChecklistState` (server action; no API route — ADR 0006);
      the toggle is **optimistic** and reverts on persistence failure
      with a calm inline "Try again".
- [ ] **R4 — no gating** is surfaced in copy and enforced in behaviour:
      the section header text says explicitly that ticking items
      tracks progress and does **not** change the
      understanding-question score; the component never blocks any
      other UI on the unit; `checklistState` is **never** an input to
      the grading call.
- [ ] A **progress indicator** ("Checked N of M") is shown — calm,
      informational; no completion celebration, no pass/fail framing.
- [ ] **Returning user** — `checklistState` is populated; the
      component renders the user's previous ticks intact.
- [ ] Blank state ("Checked 0 of N") is the **default initial render**
      — not a special empty/CTA screen.
- [ ] An **unresolved `fileRefs`** entry renders as plain text without
      an anchor; never a crash (PRD NFR "project-grounded").
- [ ] The component receives `reviewChecklist`/`checklistState`/
      `relatedFilePaths`/`unitId` as props — it does **no** data
      fetching; toggle persistence goes through a server action, not an
      API route.
- [ ] The component reads as one product with the rest of M7 and the
      M6 / M8 pages — shared components, spacing, and a calm,
      encouraging tone.
- [ ] Accessibility notes in §13 are satisfied (heading order, labelled
      checkboxes, announced toggle state, accessible file chips,
      announced persistence-failure message, AA contrast).
- [ ] The component is generated through **Claude Design (ADR 0007)** —
      the only UI-generation tool used in this project. Page Spec is
      human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #136).
