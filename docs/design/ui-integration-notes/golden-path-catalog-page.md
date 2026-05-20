# Integration Notes: Golden Path Catalog page

Issue: #34 · Epic: `golden-path-catalog` · Tool: Claude Design (ADR 0007)

Records how the Claude Design handoff for the Catalog UI was integrated into
`apps/web`. Page spec: `docs/design/golden-path-catalog-page.md`.

## What Claude Design delivered

A handoff bundle (HTML/CSS/React prototype): `index.html`, `screens.jsx`
(the real components — `ListPage`, `DetailPage`, and the loading/empty/error
states), `styles.css` (a self-contained oklch token system, light + dark),
plus canvas chrome (`app.jsx`, `design-canvas.jsx`, `tweaks-panel.jsx`) that
was ignored.

## Integration approach

The bundle README asks to **recreate the design** in whatever tech fits, not to
copy the prototype's structure. Done as:

- **Styling.** Claude Design produced a standalone CSS design system, *not*
  shadcn components. To stay pixel-faithful to the approved design, the
  prototype's `styles.css` was ported as a scoped stylesheet
  `apps/web/app/catalog/catalog.css` rather than reshaped onto `packages/ui`.
  This deviates from the prompt's "reuse `packages/ui`" note — the approved
  design won. shadcn/ui remains the system for the rest of the app; the catalog
  is a self-contained designed feature.
- **Routes.** Real Next.js App Router routes under `apps/web/app/catalog/`:
  `page.tsx` (list), `[slug]/page.tsx` (detail), plus `loading.tsx`,
  `error.tsx`, and `[slug]/loading.tsx` / `[slug]/not-found.tsx` for the
  prototype's state screens. Components in `app/catalog/_components/`.
- **Data.** The prototype's mock array was replaced with the real typed
  data-access layer (`@workspace/db` — `listGoldenPaths`, `getGoldenPathBySlug`)
  via `apps/web/lib/catalog.ts`. List filtering (search + type) is a client
  component over server-loaded data.

## Adaptations made

- Dark mode rekeyed from the prototype's `[data-theme="dark"]` to the app's
  `.dark` class (next-themes); tokens scoped to `.screen`, not `:root`.
- The prototype's fixed artboard height/overflow replaced with natural page
  scroll; nav stays sticky.
- Inline prototype SVGs replaced with `lucide-react` icons.
- IBM Plex Sans/Mono loaded via `next/font/google` (scoped in the catalog
  layout) instead of a CDN `<link>`.

## App configuration

- `next.config.mjs`: `@workspace/db` added to `transpilePackages`;
  `better-sqlite3` added to `serverExternalPackages` (native module).
- The `@workspace/db` package switched from NodeNext to bundler module
  resolution (dropped `.js` import extensions) so Turbopack resolves its
  barrel exports. Still typechecks and runs under `tsc`, `tsx`, and Vitest.
- Catalog routes are `force-dynamic` (they read the local SQLite DB) — keeps
  `next build` from needing a seeded database.

## Known characteristic

`notFound()` on the detail route renders the not-found page correctly but
returns HTTP **200**, not 404 — because `[slug]/loading.tsx` enables streaming,
which commits the status before the page resolves. This is a standard Next.js
streaming trade-off; the loading skeleton was kept (it is a design deliverable).

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (7/7), `pnpm build` all pass.
- `next start` + manual check: `/catalog` lists all 5 seeded paths;
  `/catalog/ai-native-nextjs-app` renders the full detail; an unknown slug
  shows the not-found page.
- Verified against the page spec §14 acceptance criteria.
