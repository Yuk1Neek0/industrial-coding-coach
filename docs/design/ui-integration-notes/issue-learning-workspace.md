# Integration notes — Issue Learning Workspace

Issue: #138 · Epic: `issue-based-learning-workspace`
Page Spec: `docs/design/issue-learning-workspace.page-spec.md`
Claude Design prompt: `docs/design/ui-prompts/issue-learning-workspace.prompt.md`
Implementation:
- `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx`
- `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/actions.ts`
- `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/_components/*.tsx`
- `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/{loading,not-found,error}.tsx`
- `apps/web/lib/learning-units.ts` (orchestration)

This file closes the **Claude Design round-trip** for this page per
**ADR 0007**: Page Spec → prompt → Claude Design draft → Claude Code
integration with deviations noted here. Built from the Page Spec as the
authoritative design source — no live Claude Design call was invoked (per the
task #138 hard constraint).

---

## Deviations from the Page Spec

### Field-naming differences (schema is authoritative)

The Page Spec (§5) describes a richer LLM-output contract than what the
shipped M7 schema and the generation call (#133) actually produce. Per the
spec's own §5 note ("if field names differ from the merged code at
integration time, the merged code is authoritative"), this integration
honors the schema:

| Page Spec field | Schema field |
| --- | --- |
| `RelatedFile.role` (M6-derived badge) | (not stored; UI shows `path` + `reason` only) |
| `RelatedFile.note` | `RelatedFile.reason` |
| `Concept.tieToFile` / `tieToMapNode` | (not stored; concepts carry only `name` + `explanation`. Tie is asserted by the integrity check, not surfaced as a per-concept structured field) |
| `ChecklistItem.text` / `fileRefs` / `conceptName` | `ReviewChecklistItem.id` + `description` |
| `Question.kind` / `choices` / `fileRefs` / `conceptRefs` / `focusArea` | `UnderstandingQuestion.id` + `prompt` (free-text only) |
| `Score.value` / `label` / `summary` / `questionGrades` / `gradedAt` | `UnderstandingScore.overall` + `perQuestion[]` (band label derived in UI; no `summary`) |
| `WeakArea.explanation` / `suggestion` / `relatedQuestionIds` / `fileRefs` / `conceptRefs` | `LearningWeakArea.area` + `detail` only |

These are the **same shape M8's grading UI consumes** (`area` + `detail`), so
the Score / Weak Area block is genuinely identical between M7 and M8 (NFR
Fair grading).

### Section composition

- Sections 6a (Restated goal), 6b (Related files), 6c (Concepts), 6d
  (AI-agent execution notes), 6e (Review checklist), 6f (Understanding
  questions), 6g (Score / Weak area), 6h (Challenge stub) are all present
  and rendered in the spec's top-to-bottom order.
- The optional in-page section nav (§6 step 3) is **not** rendered. The
  single-scroll page reads fine on the comfortable narrow container and
  adding the nav would duplicate landmarks for a relatively short page.
- Concept entries do not include an in-page anchor "Jump to file" chip
  (Page Spec §6c) — the schema does not carry `tieToFile`, so the UI shows
  the explanation prose only. The integrity check ensures every concept is
  grounded against a related file or M6 map node at generation time (FR-4).

### Generation on first visit

The Page Spec assumes the unit already exists when the route is opened
(§4). The implementation goes further: on first visit, if no `learning_units`
row exists for `(snapshot, source, issueRef)`, the page calls
`ensureLearningUnitAction` (the bounded generation call #133) and persists
the result before rendering. This makes the Page Spec literally true
("returning a unit if any") while also producing one for a new issue.

### Integrity surfacing (FR-4)

`verifyLearningUnitIntegrity` runs at the **integration boundary** (per
the task) on every render via `getLearningUnitView`. An unresolved
related-file path renders the row with `data-unresolved="true"`, an
"unresolved" Badge, and a page-level `inline-warn` notice — never a silent
broken link. This is the spec's §11 "Unresolved file reference" behaviour
and the PRD's FR-4.

### What is not built

- **No live Claude Design call** was invoked — task #138 explicitly forbids
  it. The React/JSX shape is built directly from the Page Spec as the
  design source.
- **No checklist gating** anywhere on the page (R4, FR-6). The Review
  Checklist UI surfaces a progress counter only; the Understanding
  Questions form is always available regardless of checklist state. Proven
  at the data layer too — `recordScore` (#135) reads no checklist column.
- **No challenge functionality** — the Challenge Panel is a read-only stub
  (R3, FR-7). See `challenge-panel.md` in this directory.
- **No per-repo aggregate score** (R6) — `Score` lives on the unit row
  only. The page never composes a "repo comprehension score".
- **No global cross-repo issues route** (R5).
