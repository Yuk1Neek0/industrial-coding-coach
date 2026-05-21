---
issue: 48
stream: ui-integration
started: 2026-05-21T15:30:00Z
status: completed
---

## Scope
Integrate the Template Registry UI pages from the Claude Design handoff (#47)
onto `apps/web` + the typed template data-access layer (#45).

## Progress
- Ported the Claude Design handoff into real Next.js App Router routes under
  `apps/web/app/templates/`:
  - `page.tsx` (list) + `[slug]/page.tsx` (detail) — Server Components.
  - `_components/template-browser.tsx` — the Client Component island: search,
    category filter, grouped/flat view toggle, no-match empty state.
  - `_components/template-card.tsx`, `detail-view.tsx`, `chrome.tsx`.
  - `loading.tsx`, `error.tsx`, `[slug]/loading.tsx`, `[slug]/not-found.tsx`
    for the prototype's state screens.
  - `layout.tsx` + `templates.css` — IBM Plex fonts and the ported design
    system (scoped to `.screen`, dark via `.dark`, shimmer keyframe namespaced
    `registry-shimmer`).
- Wired to the real data-access layer via `lib/templates.ts`
  (`listTemplates` / `getTemplateBySlug`); `null` routes through `notFound()`.
- Adapted the UI to the real `Template` schema: `fitFactors` carry no weight,
  so the Template Fit block renders reasoned factors without weight
  badges/meters (no fabricated score); `learningNotes` prose renders as a
  paragraph. Documented in `docs/design/ui-integration-notes/`.
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm build` all PASS.

## Status
Completed. Pending human review. The template-registry epic is now complete
(#44 schema, #45 data-access, #46 seed, #47 spec, #48 UI integration).
