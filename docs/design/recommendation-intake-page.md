# Page Spec: Recommendation Intake

Issue: #81 · Epic: `recommendation-engine` · PRD: `.claude/prds/recommendation-engine.md` (FR-1, FR-8)

This spec defines the **Recommendation Intake** UI for Milestone 4. It is the
input to the Claude Design prompt
(`docs/design/ui-prompts/recommendation-intake-page.md`) and to the integration
task #82. It must be human-reviewed before the prompt is run. (UI tool: Claude
Design — see ADR 0007. The task file says "v0"; ADR 0007 superseded v0 with
Claude Design — same page-spec → UI-draft hand-off gate.)

It is the entry point of the M4 Recommendation Engine. Its sibling is the
**Recommendation Result** page (`docs/design/recommendation-result-page.md`);
the two share layout, components, and tone with the M2 Catalog and M3 Registry
so the whole app reads as one product.

---

## 1. Page name

**Recommendation Intake** — a single-route form page. The user describes their
context across nine fields; submitting it runs the Recommendation Engine and
takes them to a Recommendation Result page.

## 2. User goal

> "I have a goal and some skills, and I want to build a portfolio project I can
> actually defend in interviews — but I don't know which kind of project, which
> Golden Path, or which templates fit me. Ask me a few clear questions and
> recommend one, with the reasons."

The user fills in a short, friendly form, submits it, and is taken to a tailored
recommendation.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She has
one or two AI-built portfolio projects she cannot confidently explain. She can
prompt an AI tool, run `pnpm`, and push to GitHub, but cannot justify a stack or
describe how a change flows through her code.

Design implications:
- **Low-friction, not interrogating.** Nine fields is enough to feel like real
  effort; the form must not feel like a long survey. Group fields, use sensible
  defaults and preset options, keep copy warm and plain.
- **Every field explained.** Each field has a one-line helper saying *why* it is
  asked and how it shapes the recommendation — Mia should never guess what a
  label means.
- **No wrong answers.** The form accepts free text and presets; it never rejects
  a "non-standard" stack or goal. Presets are convenience, not gates.
- **No accounts, no setup.** M4 has no authentication; the page is the same for
  everyone and works immediately.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the shell, a Client
Component for the interactive form.

| Route | Purpose | File |
|---|---|---|
| `/recommend` | The intake form | `apps/web/app/recommend/page.tsx` |

- Submitting the form creates a stored recommendation and navigates the user to
  `/recommend/[id]` (the Result page — separate spec). The new `id` is the
  identity of the stored `recommendations` row.
- An error boundary (`error.tsx`) covers the route.
- A "Get a recommendation" entry should be added to the app's primary
  navigation, alongside "Catalog" and "Templates" (out of scope to design here,
  but the page assumes it is reachable from a nav link).

## 5. Data source / contract

The page **writes**, it does not read a catalog. On submit, the nine fields
become a typed `RecommendationIntake`; the M4 engine (all in `@workspace/db`,
server-side — ADR 0006, no API route) scores it, generates a coaching narrative,
and persists a `recommendations` row:

```ts
// The nine intake fields the form collects (FR-1).
interface RecommendationIntake {
  goal: string
  experienceLevel: string
  knownStack: string[]
  jobTarget: string
  timeBudget: string
  complexityTolerance: string
  projectType: string
  aiToolPreference: string
  learningFocus: string
}

// The engine, invoked server-side from the form's submit handler:
scoreRecommendation(intake, goldenPaths, templates)        // deterministic
generateRecommendationNarrative(input, client?)            // bounded LLM call
createRecommendation(newRecommendation)                     // → Recommendation (has `id`)
```

Submit flow (the integrator's server action, task #82):
1. Build `RecommendationIntake` from the form.
2. Score it deterministically, then attempt the bounded narrative call.
3. Persist the recommendation. **The narrative call may fail independently** —
   the `narrative` column is nullable; a failed narrative still produces a saved
   recommendation. Scoring never fails for a non-empty catalog.
4. Redirect to `/recommend/[id]`.

The form needs no server data to render. It is a self-contained Client Component
over an in-file list of preset options (§7); the integrator wires its submit to
the server action.

## 6. Page sections

1. **Page header** — title "Get a recommendation" and a one-line description:
   "Tell us about your goal and your skills. We'll recommend a Golden Path and a
   set of templates — with the trade-offs, so you can defend the choices."
2. **Intake form** — the nine fields (§7), visually grouped into three labelled
   fieldsets so the form reads as three short steps, not one long list:
   - **About you** — experience level, known stack, job target.
   - **Your project** — goal, project type, learning focus.
   - **Your constraints** — time budget, complexity tolerance, AI-tool
     preference.
   Each field shows its label, its input, and a one-line helper text. The form
   is a single page (not a multi-step wizard) — all fields visible at once.
3. **Submit area** — a primary "Get my recommendation" button and a short
   reassurance line: "This takes a few seconds while we write your coaching
   notes."

## 7. Input fields

All nine are required to submit, except where noted. `knownStack` is the only
list-valued field. Preset options are convenience; free-text entry is always
allowed where marked.

| Field | Input | Behaviour / preset options |
|---|---|---|
| **goal** | textarea | Free text. Helper: "What do you want to build or achieve?" Placeholder e.g. "Build a portfolio web app I can explain in interviews." |
| **experienceLevel** | select / radio group | "Just starting out", "Built a few small projects", "Junior professional", "Career-changer with other experience". |
| **knownStack** | tag / multi-select input | Add multiple technologies as chips. Suggested chips: JavaScript, TypeScript, React, Next.js, Node, Python, HTML/CSS, Tailwind, SQL, Git. Free-text entry of any other tech is allowed. May be empty (helper: "Leave blank if you're brand new"). |
| **jobTarget** | select (with free text) | "Frontend developer", "Full-stack developer", "Backend developer", "AI / LLM engineer", "Not sure yet". Allow a custom value. |
| **timeBudget** | select / radio group | "A weekend", "A few weeks", "A couple of months", "Open-ended". |
| **complexityTolerance** | select / radio group | "Low — keep it simple", "Moderate", "High — I want a challenge". |
| **projectType** | select (with free text) | "A web app", "A full-stack app with an API", "An AI / LLM-powered app", "A developer tool / workflow", "Not sure yet". Allow a custom value. |
| **aiToolPreference** | select | "Claude Code", "Cursor", "GitHub Copilot", "ChatGPT / other chat", "No preference". |
| **learningFocus** | textarea | Free text. Helper: "What do you most want to be able to explain afterwards?" Placeholder e.g. "How routing and the server/client split work." |

Validation is light and friendly (§11): required free-text fields must be
non-empty; `knownStack` may be empty. The form is otherwise permissive — the
engine scores free text, so no value is "invalid."

## 8. Primary actions

- **Submit the form** — "Get my recommendation" runs the engine and navigates to
  the Result page. This is the one primary action.
- **Add / remove a known-stack chip** — secondary, within the `knownStack`
  field.

No save-draft, no reset button needed for M4 (the form is short).

## 9. Loading state

Submitting runs a deterministic score (instant) **and a bounded LLM call for the
narrative (a few seconds)**. While the server action runs:

- Disable the form and the submit button; the button shows an in-progress label
  ("Writing your recommendation…") with a spinner.
- A short status line reassures the user this is expected ("Scoring Golden Paths
  and writing your coaching notes — a few seconds").
- The form fields stay visible (not replaced by a skeleton) so the user keeps
  context; they are just inert.
- The submit handler carries `aria-busy` while running.

## 10. Empty state

The intake form has no data-driven empty state — it always renders its nine
fields. The "first visit, nothing entered yet" state **is** the default form
(every field at its placeholder/unselected default). No special empty screen.

## 11. Error state

- **Validation** — on submit, if a required field is empty, block submission and
  show inline, field-level messages (e.g. "Tell us your goal so we can match
  it"). Move focus to the first invalid field. Messages are real text, not
  color-only.
- **Engine / save failure** — if the server action throws (e.g. the database
  write fails), the route `error.tsx` boundary renders a friendly error:
  heading "Couldn't build your recommendation", a short explanation, and a "Try
  again" button. The entered values should be preserved where practical so the
  user does not re-type everything.
- **Narrative failure is _not_ a page error.** If only the bounded LLM call
  fails (no API key, rate limit, network), the recommendation is still scored,
  saved, and the user still lands on the Result page — which handles the missing
  narrative itself (see the Result page spec §11/§6). The intake page does not
  block on the narrative.

## 12. Success state

On a successful submit, the page does not render a success state of its own — it
**navigates** to `/recommend/[id]`, the Recommendation Result page. Success is
the Result page appearing. No toast on the intake page.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (the page title); `<main>` landmark. The
  three field groups are `<fieldset>`s with a `<legend>` ("About you", "Your
  project", "Your constraints").
- **Labels.** Every field has a programmatically associated `<label>`. Helper
  text is linked to its input via `aria-describedby`. Radio groups use
  `<fieldset>`/`<legend>`; selects are labelled, keyboard-operable controls.
- **Known-stack tag input.** Adding/removing chips is fully keyboard-operable
  (type + Enter to add; Backspace/Delete or a labelled remove button to remove).
  Each chip's remove control has an accessible name ("Remove React").
- **Validation.** Invalid fields set `aria-invalid`; the error message is linked
  via `aria-describedby` and is real text. Focus moves to the first invalid
  field on a failed submit.
- **Submitting.** The submit region carries `aria-busy="true"` while the action
  runs; the disabled state is not conveyed by color alone.
- **Keyboard.** Full keyboard operability in logical (DOM = visual) order: every
  input, the chip controls, and the submit button are reachable; Enter/Space
  activate. Visible focus ring throughout.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes (the app
  uses `next-themes`). Required-field and error indication use text, not color
  alone.
- **Targets.** Inputs, chips, and the submit button are comfortably sized for
  pointer and touch.

## 14. Acceptance criteria

- [ ] `/recommend` renders a single-page form collecting **all nine** intake
      fields (§7), grouped into the three labelled fieldsets of §6.
- [ ] Each field has a label and a one-line helper explaining why it is asked.
- [ ] `knownStack` is a multi-value chip/tag input (add several, free text
      allowed, may be empty); the other eight fields are single-value.
- [ ] Submitting builds a `RecommendationIntake` and triggers the server-side
      engine; the user is then navigated to `/recommend/[id]`.
- [ ] A **loading** state covers the few-second narrative call: the form is
      inert, the submit button shows progress, a reassurance line is shown.
- [ ] Light, friendly **validation** blocks an empty required field with an
      inline message and moves focus to it.
- [ ] An **engine/save error** shows a friendly "Try again" error; a
      **narrative-only failure does not block** the flow.
- [ ] The page reads as one product with the M2 Catalog and M3 Registry — shared
      layout, spacing, and calm, content-first tone.
- [ ] Accessibility notes in §13 are satisfied (one `<h1>`, fieldsets/legends,
      associated labels and helper text, keyboard-operable chip input, focus
      management on validation, AA contrast).
- [ ] Page spec is human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #81).
