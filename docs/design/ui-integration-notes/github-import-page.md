# Integration Notes: GitHub Repository Import page

Issue: #42 · Epic: `github-integration` · Tool: Claude Design (ADR 0007)

Records how the Claude Design handoff for the Import UI was integrated into
`apps/web`. Page spec: `docs/design/github-import-page.md`. Claude Design
prompt: `docs/design/ui-prompts/github-import-page.md`.

## What Claude Design delivered

A handoff bundle (HTML/CSS/React prototype) for the same project as the M2
Catalog: `Import.html`, `import-screens.jsx` (the real components — the form,
plus the idle / in-progress / success / re-import / four-error states),
`styles.css` + `styles-extra.css` (the shared oklch token system extended with
form/status/progress styles), plus canvas chrome (`import-app.jsx`,
`design-canvas.jsx`, `tweaks-panel.jsx`) that was ignored.

## Integration approach

The bundle README asks to **recreate the design** in whatever tech fits, not to
copy the prototype's structure. Done as:

- **Styling.** Claude Design produced a standalone CSS design system, *not*
  shadcn components. To stay pixel-faithful — and consistent with how the M2
  Catalog was integrated — the prototype's `styles.css` + `styles-extra.css`
  were ported as a scoped stylesheet `apps/web/app/import/import.css`. This
  deviates from the prompt's "reuse `packages/ui`" note; the approved design
  won, exactly as it did for the catalog. shadcn/ui remains the system for the
  rest of the app.
- **Route.** A single Next.js App Router route `apps/web/app/import/page.tsx`
  (page spec §4) — a Server Component shell. There is **no `loading.tsx`**: the
  page is a form and renders instantly; "loading" is the in-page in-progress
  state. `error.tsx` covers only unexpected render-time failures.
- **Interactive island.** The form + status/result region is one Client
  Component, `app/import/_components/import-flow.tsx`. It owns the idle /
  in-progress / success / error state machine.
- **Data.** The prototype's mock import action was replaced with the real typed
  data-access layer. `lib/github-import.ts` wraps `@workspace/db`'s
  `importRepository` (#40) and maps its `GitHubResult` onto serializable view
  shapes; `app/import/actions.ts` exposes it as a Server Action the client
  calls.

## Adaptations made

- Dark mode rekeyed from the prototype's `[data-theme="dark"]` to the app's
  `.dark` class (next-themes); tokens scoped to `.screen`, not `:root`. CSS
  keyframes namespaced (`import-indeterminate`, `import-spin`) to avoid global
  collisions with `catalog.css`.
- `lucide-react` no longer ships brand icons, so the GitHub mark is a small
  inline SVG (`GitHubMark` in `_components/chrome.tsx`) — the design prototype
  itself used an inline SVG for the same reason.
- **URL parsing is client-side** (`lib/github-url.ts`, dependency-free), per
  page spec §7: an unparseable value becomes the `invalid-url` error state with
  no network round-trip. The server still validates on import.
- Error `kind`s are mapped: the data-access layer's typed `GitHubErrorKind`
  (`invalid_url`, `not_found`, `auth_failed`, `rate_limited`, `http_error`,
  `network_error`) maps onto the five UI kinds (`invalid-url`, `not-found`,
  `rate-limited`, `auth-failure`, `unknown`). `http_error`/`network_error`
  both fold into the generic `unknown` fallback.
- The UI renders **curated per-kind copy**, not the raw `error.message` — the
  data-access messages contain HTTP status codes ("GitHub returned 404 …"),
  which page spec §11 forbids showing. The message is still returned to the
  client (kept for diagnosis) but not displayed.
- `fileCount` is the count of **blob** entries in the snapshot's file tree
  (directories excluded).
- Re-import detection uses `ImportResult.updated` directly (the import module
  already reports it), rather than a separate `getImportedRepo` call as the
  spec's §5 sketch suggested — same result, one fewer query.
- The success view's **forward action ("View imported repository") is omitted**:
  no imported-repo view route exists in M11. Page spec §8/§12 explicitly says to
  hide it rather than link nowhere. "Import another repository" is the only
  success action.
- An `Import` link was added to the import page's own nav. The M2 Catalog's
  nav (`app/catalog/_components/chrome.tsx`) still has a dead `Templates` link
  and no `Import` link — wiring the catalog nav to `/import` is left out of
  scope to avoid touching catalog files; a later nav-unification task can do it.

## Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm build` all pass; `/import` builds as a
  static route (the Server Action runs dynamically at request time).
- Page-spec §14 acceptance criteria reviewed: URL + optional ref inputs and an
  Import button; client-side URL parse → `invalid-url` with no call; first-class
  in-progress state with disabled controls; success view with identity, summary,
  and captured-files list; distinct "snapshot refreshed" copy on re-import; all
  four boundary errors plus a generic fallback, each with heading + explanation
  + recovery; form values kept after an error; reads through the typed
  data-access layer; private-repo hint references `.env`, never collects a
  token; `aria-live` status region, single `<h1>`, ordered headings, labelled
  inputs.
