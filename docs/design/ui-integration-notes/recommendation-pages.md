# UI Integration Notes: Recommendation Engine pages

Issue: #82 · Epic: `recommendation-engine` · Tool: Claude Design (ADR 0007)

Integration of the Claude Design handoff for the M4 Recommendation Intake and
Result pages into `apps/web`. Page specs: `docs/design/recommendation-intake-page.md`,
`docs/design/recommendation-result-page.md`.

## What was integrated

- **`/recommend`** — the intake form: nine fields in three `<fieldset>` groups,
  a keyboard-operable known-stack chip input, free-text-capable selects, light
  client-side validation, and a submit-to-engine flow with a busy state.
- **`/recommend/[id]`** — the result view: recommended Golden Path, recommended
  templates, the four-part coaching narrative, rejected alternatives, the
  collapsible intake summary, in-place edit mode (FR-7), the
  narrative-unavailable panel with a "Generate coaching notes" action, plus
  `loading.tsx`, `not-found.tsx`, and `error.tsx`.
- **`lib/recommendations.ts`** — server-side orchestration over `@workspace/db`
  (scoring → bounded narrative call → persistence; result resolution).
- **`actions.ts`** — three server actions: create, update (edit), and generate
  narrative. The pages never call the Anthropic SDK directly.

## Design source

The handoff bundle's `Recommendation Engine.html` loads the `recommend-*` files
(`recommend-app.jsx`, `recommend-screens.jsx`, `recommend-data.js`,
`styles-recommend.css`) — the final iteration. The earlier `recommendation-*`
set in the bundle was not used.

## Decisions and deviations

- **Icons** — the prototype's inline `RIcon` SVGs were replaced with
  `lucide-react`, the app's existing icon convention (M2/M3/M11).
- **Stylesheet** — `recommend.css` is the shared catalog design-system base plus
  the recommendation-specific rules from `styles-recommend.css`. Dark mode is
  rekeyed from the prototype's `[data-theme]` to the app's `.dark` class;
  keyframes are namespaced (`recommend-*`) to avoid collisions with the other
  feature stylesheets. Same approach as `templates.css` / `import.css`.
- **Radio pills** — selection styling uses `:has(input:checked)` rather than the
  prototype's statically-set `data-checked` attribute, since the live form is
  controlled React state.
- **Edit mode scope (FR-7)** — matches the chosen design (`recommend-screens.jsx`):
  edit mode changes the recommended Golden Path and the four narrative fields.
  Templates and rejected alternatives are read-only. (The page spec floated
  editing templates too; the design narrowed it, and the design was followed.)
- **Narrative is nullable** — a failed bounded narrative call still yields a
  saved recommendation; the result page renders the recommendation and shows the
  narrative-unavailable panel. Verified end-to-end against the seeded catalog
  with no API key set.

## Follow-up (out of scope for #82)

- The `/recommend` entry was added to this feature's nav chrome. The Catalog,
  Templates, and Import pages each carry their own `chrome.tsx` and were left
  unchanged — the app-wide nav is already inconsistent (e.g. Import's nav has a
  dead Templates link); unifying it is a separate cleanup.
