---
issue: 42
stream: ui-integration
started: 2026-05-21T15:00:00Z
status: completed
---

## Scope
Integrate the GitHub Import UI page from the Claude Design handoff (#41) onto
`apps/web` + the typed repo-import data-access layer (#40).

## Progress
- Ported the Claude Design handoff into a real Next.js App Router route at
  `apps/web/app/import/`:
  - `page.tsx` — Server Component shell (header + layout).
  - `_components/import-flow.tsx` — the Client Component island: the form and
    the idle / in-progress / success / error state machine.
  - `_components/chrome.tsx` — `AppNav`, `Badge`, inline `GitHubMark` SVG.
  - `layout.tsx` + `import.css` — IBM Plex fonts and the ported design system
    (scoped to `.screen`, dark via `.dark`, keyframes namespaced `import-*`).
  - `error.tsx` — route error boundary for unexpected render-time failures only.
- Wired the page to the real data-access layer: `lib/github-import.ts` wraps
  `@workspace/db`'s `importRepository` and maps `GitHubResult` onto serializable
  view shapes; `app/import/actions.ts` exposes it as a Server Action.
- `lib/github-url.ts` — dependency-free, client-safe URL parser; an unparseable
  value yields the `invalid-url` error state with no network call (spec §7).
- Recorded the integration in `docs/design/ui-integration-notes/`.
- Verified: `pnpm typecheck`, `pnpm lint`, `pnpm build` all PASS; `/import`
  builds as a static route.

## Status
Completed. Pending human review. The github-integration epic is now complete
(#37 → #38 → #39 → #40 backend, #41 spec, #42 UI integration).
