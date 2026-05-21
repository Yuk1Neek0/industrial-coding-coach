# Integration Notes: Template Registry page

Issue: #48 · Epic: `template-registry` · Tool: Claude Design (ADR 0007)

Records how the Claude Design handoff for the Template Registry UI was
integrated into `apps/web`. Page spec: `docs/design/template-registry-page.md`.
Claude Design prompt: `docs/design/ui-prompts/template-registry-page.md`.

## What Claude Design delivered

A handoff bundle (HTML/CSS/React prototype) for the same project as the M2
Catalog: `Template Registry.html`, `templates-screens.jsx` (the real
components — the list page with grouped/flat views, the detail page with the
Template Fit block, and the loading/empty/error/not-found states),
`templates-data.js` (a mock 15-template array), and the shared `styles.css` +
`styles-extra.css` design system. Canvas chrome was ignored.

## Integration approach

The bundle README asks to **recreate the design** in whatever tech fits. Done
as, mirroring the M2 Catalog integration so the two read as one product:

- **Styling.** The prototype's design system was ported as a scoped stylesheet
  `apps/web/app/templates/templates.css` — the catalog's `catalog.css` plus the
  registry-specific additions (segmented control, category sections, the
  Template Fit block). This deviates from the prompt's "reuse `packages/ui`"
  note; the approved design won, exactly as for the catalog.
- **Routes.** Real Next.js App Router routes under `apps/web/app/templates/`:
  `page.tsx` (list), `[slug]/page.tsx` (detail), plus `loading.tsx`,
  `error.tsx`, `[slug]/loading.tsx`, `[slug]/not-found.tsx` for the prototype's
  state screens. Components in `app/templates/_components/`.
- **Data.** The prototype's mock array was replaced with the real typed
  data-access layer (`@workspace/db` — `listTemplates`, `getTemplateBySlug`)
  via `apps/web/lib/templates.ts`. The search + category filter and the
  grouped/flat view toggle are a Client Component (`template-browser.tsx`) over
  server-loaded data; a `null` from `getTemplate` routes through `notFound()`.

## The data-shape mismatch — the load-bearing decision

The design's UI contract and the **real `Template` schema** (`packages/db`,
tasks #44/#45) differ. The page was adapted to the stored shape, not the other
way round:

- **`fitFactors` carry no weight.** The design's Template Fit block is built
  around a coarse `strong | moderate | weak` weight per factor (weight badges,
  3-segment meters, strong→weak sorting, a "N strong" card cue). The stored
  `TemplateFitFactor` is `{ factor, detail }` — there is **no weight field**.
  Inventing weights would fabricate reasoning data the registry does not hold,
  so the Template Fit block renders each factor as `factor` (label) + `detail`
  (one-line note) **without** weight badges, meters, or weight ordering. The
  list-card fit indicator is the plain factor count ("Fit: 3 factors"), not
  "2 strong". This still satisfies the page spec's core intent — fit as
  *reasoned factors, not an opaque score* — and the prompt's explicit "do not
  introduce a numeric score". If a coarse weight is wanted later, it belongs in
  the schema + seed first (a scoped follow-up), then in this UI.
- **`learningNotes` is prose, not a list.** The design renders a checklist; the
  stored field is a single `text` string. It is rendered as a paragraph in the
  "What you'll be able to explain" section.

## Other adaptations

- Dark mode rekeyed from the prototype's `[data-theme="dark"]` to the app's
  `.dark` class (next-themes); tokens scoped to `.screen`. The shimmer keyframe
  is namespaced `registry-shimmer` so it does not collide with `catalog.css`.
- Category group headings get a DOM-id-safe slug (`Doc/Spec Template` →
  `cat-doc-spec-template`) for `aria-labelledby`.
- The registry nav links `Templates` → `/templates`; `Catalog` → `/catalog`.
  The M2 Catalog nav still does not link to `/templates` — wiring it is left
  out of scope to avoid touching catalog files.
- The M2 catalog detail page renders `templatesReferenced` as plain chips;
  linking those chips to `/templates/[slug]` is explicitly **not** part of #48
  (prompt note) and was not done.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass; `/templates` and
  `/templates/[slug]` build as dynamic routes (they read the local SQLite DB).
- Page-spec §14 acceptance criteria reviewed: list with search + category
  filter + grouped/flat toggle and a result count; whole-card links; detail
  page with all reasoning sections visible (not collapsed); the Template Fit
  block (criteria callout + reasoned factors, no numeric score); loading /
  not-seeded / no-match / error / not-found states; single `<h1>` per page,
  ordered headings, landmarks, labelled controls.
