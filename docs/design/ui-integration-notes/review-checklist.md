# Integration notes — Review Checklist UI

Issue: #138 · Epic: `issue-based-learning-workspace`
Page Spec: `docs/design/review-checklist.page-spec.md`
Claude Design prompt: `docs/design/ui-prompts/review-checklist.prompt.md`
Implementation:
- `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/_components/review-checklist.tsx` (Client Component island)
- `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/actions.ts` → `toggleChecklistItemAction`
- `apps/web/lib/learning-units.ts` → `toggleChecklistItem` (the orchestration wrapper around `updateChecklistState` from #135)

This file closes the **Claude Design round-trip** for this component per
**ADR 0007**. Built from the Page Spec as the authoritative design source —
no live Claude Design call was invoked.

---

## Deviations from the Page Spec

### Field-naming differences (schema is authoritative)

The Page Spec describes `ChecklistItem` with `text` / `fileRefs[]` /
`conceptName`. The shipped schema's `ReviewChecklistItem` carries only
`id` + `description`. Per the spec's §5 note, the merged code is
authoritative. The UI:

- renders `description` as the item label (in place of `text`);
- shows **no per-item file/concept chips** — the FR-4 integrity check
  enforces concrete checklist items at generation time (the integrity
  check's `abstract-checklist-item` kind catches generic filler), so the
  prose itself names the file(s) / concept(s) the user should verify;
- omits the M6 `tieTo*` linking pattern entirely, mirroring how concepts
  are surfaced on the parent page.

### State shape

The Page Spec models `ChecklistState` as
`{ items: Record<string, { done: boolean; toggledAt: Date }> }`. The
shipped schema's `checklist_state` column is a flat
`ChecklistItemState[]` (one `{ itemId, checked }` per ticked item). The
UI converts both ways via `checklistStateToMap` / `mapToChecklistState`
in `apps/web/lib/learning-units.ts`. `toggledAt` is not persisted — the
column carries `updatedAt` at the unit level instead, which the parent
page surfaces in its header.

### R4 normative — surfaced exactly as written

The component:
- shows the progress counter as `"Checked {n} of {N}"`;
- includes the spec's verbatim sentence ("Ticking items tracks your
  progress; it does not change your understanding-question score") in the
  section intro prose (bolded for visibility);
- **never** locks the Understanding Questions form, never hides it, never
  surfaces a "complete the checklist" CTA, never sends `checklistState`
  into the grading action. The grading action signature
  (`gradeLearningUnitAction({ unitId, answers })`) is the data-shape proof.

### Optimistic UI and failure handling

Each toggle is an optimistic local update wrapped in a `useTransition`.
On failure (`toggleChecklistItemAction` returns `ok: false`), the toggle
reverts and an `inline-warn` row appears beneath the list with the typed
error message — the rest of the checklist remains fully interactive.
This matches spec §11.

### What is not built

- **No "fully ticked" celebration / banner** (spec §12 explicitly forbids
  it for R4 reasons).
- **No collapsed/grouped checklist** — every row is visible, scannable
  (spec §6).
- **No per-row file-reference chips** — schema does not carry them; the
  integrity check enforces concreteness in the prose.
