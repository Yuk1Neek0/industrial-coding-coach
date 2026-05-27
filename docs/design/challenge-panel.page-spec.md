# Page Spec: Challenge Panel

Issue: #136 · Epic: `issue-based-learning-workspace` · PRD: `.claude/prds/issue-based-learning-workspace.md` (FR-7, FR-8, FR-10)

This spec defines the **Challenge Panel** for Milestone 7. It is the input to
the Claude Design prompt
(`docs/design/ui-prompts/challenge-panel.prompt.md`) and to the integration
task #138. It must be human-reviewed before the prompt is run. (UI tool:
**Claude Design** — see **ADR 0007**, which establishes Claude Design as the
only UI-generation tool used in this project.)

The Challenge Panel is **not a standalone route** — it is a component
embedded in the **Issue Learning Workspace** page
(`docs/design/issue-learning-workspace.page-spec.md` §6h) at route
`/repos/[owner]/[repo]/issues/[issueRef]`. It is **read-only**: per FR-7 and
R3 the panel renders a **minimal stub** (`challenge_concept` and
`challenge_type`) and an explicit **"deferred to M9"** message. **It does
not run, grade, or claim to resolve a challenge** — that is M9 (Debug &
Expansion Challenges). It shares layout, components, and tone with the rest
of M7 and the M6 / M8 pages.

---

## 1. Page name

**Challenge Panel** — the embedded read-only stub component within the
Issue Learning Workspace page: it renders the challenge stub fields for this
learning unit and announces, plainly, that the full debug/expansion
challenge is deferred to Milestone 9.

## 2. User goal

> "Now that I understand this issue, give me a sense of the next step — what
> kind of challenge would deepen my grasp of *this* code — without
> pretending you can run one for me today. Be honest about what's deferred."

The user sees the **concept** of the challenge (e.g. "trace a failed login
call from the API route to the rate-limit middleware") and the **type** of
challenge it would be (e.g. "debug" or "expand"), and is told plainly that
the runnable challenge lives in M9.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She is
working through her first real review-AI-work loop on this issue; the
Challenge Panel is the *next step pointer* — it must not over-promise.

Design implications:
- **Honest about deferral.** The product's credibility rests on not
  pretending M9 functionality exists. The panel is calm and visually
  subdued; the "deferred to M9" message is plainly visible and is real,
  announced text — not a hidden footnote (PRD FR-7, R3 — *normative*).
- **A pointer, not a feature.** The panel is read-only — **no run button,
  no grade button, no answer field**. The product rejects "fake M9"
  behaviour: if it cannot run a challenge, it must not appear to.
- **Tied to the issue.** The stub `challenge_concept` references *this*
  issue's code and concepts (PRD FR-4) — not a generic "try a hands-on
  exercise" platitude. The concept is concrete; it is just not runnable
  yet.
- **Honest about AI.** The stub is itself AI-generated. The component
  inherits the Issue Learning Workspace's "AI-generated learning unit"
  framing (no separate label needed).
- **Visually subdued.** The Challenge Panel is the *least* prominent
  section on the unit (the grounding sections and the answer-and-score
  loop are the product). Calm typography, no CTAs, no badges screaming
  "coming soon!" — just an honest, restrained note.
- **No accounts, no setup.** M7 has no authentication; the stub renders
  by unit id.

## 4. Route(s)

**No route of its own.** The component is rendered inside
`apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/page.tsx` (the Issue
Learning Workspace page) as the §6h "Challenge" section. It is a **Server
Component** — it renders already-stored data, has **no interactive state**,
and does no fetching. Suggested home:
`apps/web/components/learning/challenge-panel.tsx`. Final placement is the
integrator's call (task #138).

## 5. Data source / contract

The component **receives the stub fields as props** — it does no fetching.
Its parent (the Issue Learning Workspace page) loads the `LearningUnit`
via the M7 data-access layer (`getLearningUnitByRef`, task #135) and
passes the relevant slice down.

```ts
interface ChallengePanelProps {
  // R3 — only these two stub fields exist in M7. The M9 epic will add
  // its full challenge schema in its own migration; M7 pre-allocates
  // nothing else (FR-7, R3).
  challengeConcept: string
  challengeType: string
}
```

### Typed contracts the component renders

These are produced by the M7 generation call (task #133) as the
**minimal stub** allowed by the PRD; they are part of the
`LearningUnit` contract
(`docs/design/issue-learning-workspace.page-spec.md` §5). The exact
TypeScript lives in `packages/db` (under `learning-units/`); if the
merged code differs at integration time the merged code is
authoritative, but the shape is fixed by PRD FR-7 / R3 and must not
change without updating this spec.

**`challengeConcept`** — `string`:
- one or two plain-language sentences describing the **concept** of the
  challenge that *would* exercise this issue's code — e.g. "Trace a
  failed login call from the API route through the rate-limit
  middleware and find where the 429 is emitted" or "Add a per-user
  daily quota on top of the per-IP rate limit and update the tests";
- grounded in this issue's related files and concepts (PRD FR-4);
- **not** a checklist, **not** an instruction set, **not** an
  acceptance-criteria list — just the concept, in prose.

**`challengeType`** — `string`:
- a short label, drawn from a calm vocabulary aligned with M9's
  intended scope: e.g. "debug" (trace / find / explain a behaviour)
  or "expand" (add / extend a behaviour). M7 does **not** enumerate
  this vocabulary as a typed enum — R3 says M7 stores only the stub
  fields, and the full set lives with M9's PRD when M9 lands.

> **R3 normative — minimal stub fields only.** M7 stores **only**
> `challenge_concept` and `challenge_type` on `learning_units`. M9 will
> add its full challenge schema (acceptance criteria, runnable
> harness, grading shape, etc.) in its **own Drizzle migration** when
> M9 lands. **M7 does not pre-allocate M9 fields** — no `acceptance_criteria`,
> no `solution_diff_hash`, no `runner_config`, no schema scaffolding.
> The stub is intentionally small so it cannot lie about what M9 will
> look like.

> **FR-7 normative — the stub is non-functional.** The panel **does
> not run, grade, or claim to resolve a challenge**. There is no input
> field, no submit, no "start challenge" button, no scoring, no
> persistence beyond the read of the two stub fields. The full
> challenge lives in M9; this panel is the honest pointer that says
> so. Pretending otherwise (a fake "Coming soon!" button that does
> nothing, a placeholder answer box, an empty score) would be the
> exact "silently fake M9 functionality" failure mode PRD US-7
> rejects.

## 6. Page sections

The component is a single headed section — visually subdued — within
the Issue Learning Workspace page. Top to bottom:

1. **Section header** — heading "Challenge" and a one-line description
   "A debug or expand exercise that would deepen your grasp of *this*
   issue's code. The runnable challenge lives in Milestone 9 — this
   panel is a preview of the concept."
2. **Type label** — `challengeType` shown as a small calm tag (e.g.
   "Debug" or "Expand"). Meaning carried by the text, not by color
   (M9 has not specified the type vocabulary yet, so the UI must not
   bake in any color-coded semantics).
3. **Concept** — `challengeConcept` rendered as readable prose, plain
   language, the substantive content of the panel.
4. **Deferral notice** — an explicit, visible message: heading
   "Deferred to Milestone 9" (or rendered as a calm `Alert` /
   inline note), body text "Running and grading challenges is part
   of the Debug & Expansion Challenges milestone (M9). When M9
   lands, this panel will host the runnable challenge for this
   issue." This message is **always shown** when the panel renders
   — it is **not** hidden behind a "Learn more" toggle (R3, FR-7).

The panel is rendered as a single subdued `Card` or sectioned region
— content-first, low chrome. No call-to-action buttons, no "Start
challenge" CTA, no progress indicator, no input fields.

## 7. Input fields

The Challenge Panel has **no input fields**. It is a read-only
presentation of the two stub fields (FR-7, R3). Adding an input
field — even a disabled placeholder — would imply that M9 functionality
exists today; that is exactly what R3 forbids.

## 8. Primary actions

- **Read the concept** — the only action on this panel. The user
  reads `challengeConcept` and `challengeType` and the deferral
  notice.

No create/edit/delete; no run/grade. The panel is intentionally
inert (R3, FR-7).

## 9. Loading state

The component does **not** own a loading state. Its parent (the
Issue Learning Workspace page,
`docs/design/issue-learning-workspace.page-spec.md` §9) renders the
route skeleton; by the time this component renders,
`challengeConcept` and `challengeType` are already loaded and passed
in.

## 10. Empty state

The M7 generation call always produces a `challenge_concept` and a
`challenge_type` on a successful unit (PRD FR-3, FR-7) — even when
the unit's other fields degrade gracefully (no related files, no M6
map, etc.), the stub fields are required.

Defensive case: if `challengeConcept` is unexpectedly empty (or
whitespace-only) at render time, render the section header and the
deferral notice but **replace the missing concept with a quiet
inline note**: "No challenge concept was generated for this unit."
The deferral notice still shows. The panel must never appear empty
or broken.

The same applies defensively if `challengeType` is unexpectedly
empty — render the panel without the type tag, never crash.

## 11. Error state

The component does **not** fetch and has **no interactive state**,
so it has **no error state of its own**. A failure to load the
`LearningUnit` is handled by the Issue Learning Workspace page's
route `error.tsx` boundary, not here
(`docs/design/issue-learning-workspace.page-spec.md` §11).

## 12. Success state

- The panel renders `challengeConcept` as prose, the
  `challengeType` as a small calm tag, and the **deferral notice**
  visibly — every field of §5 has a home in the layout, and the M9
  deferral is plainly stated.
- A returning user sees exactly the same content — the stub is
  stable for the unit's lifetime (M9 will rewrite it when M9 lands,
  in its own migration).
- Success is otherwise implicit (content shown) — there is no
  confirmation, no loop to close.

## 13. Accessibility notes

- **Semantics & headings.** The section has one heading
  ("Challenge") at the level the parent page assigns it (an `<h2>`);
  the deferral notice may be an `<h3>` sub-heading or a calm
  `Alert` region with a programmatic role and label. No skipped
  heading levels.
- **Deferral notice announced.** The "Deferred to Milestone 9"
  message is **real, announced text** — not a color-only or
  icon-only signal, not hidden behind a toggle. A screen reader
  encounters it on first traverse of the section.
- **Type tag.** The `challengeType` tag conveys meaning by text,
  not color alone — and AA-contrast in both themes.
- **AI-generated framing.** The panel inherits the parent's
  "AI-generated learning unit" label; it does not need its own.
- **No interactive elements.** Because the panel is read-only, no
  focusable controls are needed; the DOM order matches the visual
  order so a screen reader reads header → type → concept →
  deferral notice.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark
  themes (the app uses `next-themes`). The subdued styling must
  still meet AA — "visually subdued" is not an excuse for low
  contrast.
- **Targets.** No interactive targets — the panel is read-only.

## 14. What this page does not do

- It **does not run a challenge** (FR-7, R3 — *normative*). There
  is no "run" button, no execution, no harness. Running is M9.
- It **does not grade a challenge** (FR-7, R3 — *normative*).
  There is no grading call, no score, no verdict. Grading is M9.
- It **does not collect user input on the challenge** (FR-7, R3 —
  *normative*). There is no answer field, no diff editor, no
  attempt-state persistence. M7 does not pre-allocate any user
  state for the challenge.
- It **does not pre-allocate the M9 schema** (R3 — *normative*).
  M7 stores **only** `challenge_concept` and `challenge_type` on
  `learning_units`; the full M9 schema (acceptance criteria,
  runner config, grading shape, etc.) lands in M9's own migration.
- It **does not write to GitHub** — read-only per ADR 0009 (PRD
  "Out of Scope").
- It **does not claim a release date for M9** — the deferral
  notice says "Milestone 9", not a calendar date.

## 15. Acceptance criteria

- [ ] The component renders **`challengeConcept`** as readable
      prose and **`challengeType`** as a calm text tag — the only
      two stub fields M7 stores (R3, FR-7).
- [ ] The component renders an **explicit "Deferred to Milestone
      9" notice** — visibly, plainly, **always** when the panel
      renders; not hidden behind a toggle (FR-7, R3 —
      *normative*).
- [ ] The component has **no input fields, no buttons, no
      run/grade affordances** — it is read-only by design (FR-7,
      R3 — *normative*). Adding any of these would imply M9
      functionality exists; the panel must not lie about that.
- [ ] The component **does not pre-allocate M9 fields** — the
      data contract is exactly `{ challengeConcept,
      challengeType }`; no `acceptanceCriteria`, no `runnerConfig`,
      no scaffolding (R3 — *normative*).
- [ ] The component receives `challengeConcept` and
      `challengeType` as props — it does **no** data fetching.
- [ ] Visually subdued: the panel is the **least** prominent
      section on the Issue Learning Workspace — the grounding
      sections and the answer-and-score loop are the product
      (R3 — *normative*: no "Coming soon!" hype, no CTA).
- [ ] Defensive: an empty `challengeConcept` or `challengeType`
      renders a quiet inline note in place of the missing field;
      the deferral notice still shows; the panel never crashes.
- [ ] The component reads as one product with the rest of M7 and
      the M6 / M8 pages — shared components, spacing, calm tone.
- [ ] Accessibility notes in §13 are satisfied (heading order,
      announced deferral notice, type tag not color-only, no
      misleading focusable controls, AA contrast).
- [ ] The component is generated through **Claude Design (ADR
      0007)** — the only UI-generation tool used in this project.
      Page Spec is human-reviewed before the Claude Design prompt
      is used (Definition of Done, task #136).
