# Integration notes — Understanding Questions UI

Issue: #138 · Epic: `issue-based-learning-workspace`
Page Spec: `docs/design/understanding-questions.page-spec.md`
Claude Design prompt: `docs/design/ui-prompts/understanding-questions.prompt.md`
Implementation:
- `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/_components/understanding-questions.tsx` (Client Component island)
- `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/actions.ts` → `gradeLearningUnitAction`
- `apps/web/lib/learning-units.ts` → `gradeLearningUnitAnswers`
- Backend: `gradeLearningUnit` (#134) + `recordAnswers` / `recordScore` (#135)

This file closes the **Claude Design round-trip** for this component per
**ADR 0007**. Built from the Page Spec as the authoritative design source —
no live Claude Design call was invoked.

The shape **mirrors M8's `UnderstandingCheck` + `ScoreWeakArea`** components
(`apps/web/app/reviews/r/[id]/_components/*.tsx`) per NFR Fair grading and
the PRD note that M7's grading shape matches M8's. Side-by-side comparison
of the two milestones' flows reads as one product.

---

## Deviations from the Page Spec

### Field-naming differences (schema is authoritative)

The Page Spec describes a `Question.kind` of `"free_text" | "multiple_choice"`
with optional `choices[]`, plus `fileRefs`, `conceptRefs`, and `focusArea`.
The shipped `UnderstandingQuestion` carries only `id` + `prompt`. Per the
spec's §5 note, the merged code is authoritative. All questions are rendered
as free-text answers — the exact same shape M8's `ComprehensionQuestion`
uses (M8 also has no `kind`/`choices`; see
`apps/web/app/reviews/r/[id]/_components/understanding-check.tsx` for the
parallel).

The Page Spec's `Score` includes `label` / `summary` / `questionGrades[]` /
`gradedAt`. The shipped `UnderstandingScore` is `overall` + `perQuestion[]`.
The UI:

- derives `label` in-component from `overall` (vocabulary mirrors M8's
  `scoreLabel`: "Solid grasp" / "Getting there" / "Needs review" /
  "Worth re-studying");
- omits `summary` (the spec's "one or two sentences of plain-language
  feedback") — the schema does not carry it; the page-level "AI-generated
  coaching feedback" framing carries the same honest signal;
- omits the per-question breakdown UI (§6b) — `perQuestion[]` IS persisted
  by `recordScore`, but the spec's §6b row format (`questionPrompt`,
  `verdict`, `pointsAwarded/Possible`, `feedback`, `focusArea`) requires
  fields the schema does not carry. Match the M8 pattern: weak-area
  blocks are the actionable payoff (spec §6c), and they ARE rendered.

The Page Spec's `WeakArea` has `explanation` / `suggestion` /
`relatedQuestionIds` / `fileRefs` / `conceptRefs`. The shipped
`LearningWeakArea` is `area` + `detail` only — **the same shape M8's
`WeakArea` uses** (NFR Fair grading is exactly this shape parity). The
weak-area block renders `area` as the heading and `detail` as the prose.

### The answer-and-score loop

- The form renders one `Textarea` per question. Blank answers are
  permitted (the spec calls this out — "the check is formative").
- On submit the form posts through `gradeLearningUnitAction` → bounded
  grading call (#134) → persists answers + score + weak areas (#135).
- The component never reaches the Anthropic SDK directly — only via the
  Server Action.
- After grading, the form re-renders read-only with the user's typed
  answers preserved, and the Score / Weak Area block renders below.
  Returning users with a stored score land directly in this state.

### Error handling

A grading failure surfaces as a calm in-form `inline-warn` with a "Try
again" button — answers are kept, the form stays active. This matches
M8's grading-failure flow exactly.

### What is not built

- **No `kind: "multiple_choice"` branch** — the schema doesn't model it
  (matches M8, and the spec calls it out as the secondary case).
- **No per-question grading row** (§6b) — schema lacks the fields the
  spec's row requires.
- **No per-question "verdict" badge** — same reason.
- **No "Try again from a fresh tab" CTA in the UI** — re-grading would
  require either a "clear answers" affordance or a re-attempt counter,
  neither of which is in the schema or the spec. Returning users can
  edit answers and re-grade (the action re-runs and overwrites the prior
  result — proven by the `units.test.ts` "re-scored, replacing the prior
  score" test).
- **No cross-unit aggregate** (R6 — strictly per-unit). The page never
  composes a repo-level score.
