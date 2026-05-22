# UI Integration Notes: Stack Explainer

Issue: #89 · Epic: `stack-explainer` (M5) · Tool: **Claude Design** (ADR 0007)

Records how the Claude Design handoff for the three M5 UIs — the Stack
Explanation page, the Stack Decision Map, and the Alternatives Comparison — was
integrated into `apps/web`. Specs: `docs/design/stack-explanation-page.md`,
`stack-decision-map.md`, `alternatives-comparison.md`.

## Handoff bundle

The user generated all three pieces in one Claude Design project and exported a
single bundle. The bundle delivered the design as an HTML/JS prototype
(`Stack Explanation.html` + `stack-screens.jsx` + `stack-data.js` +
`styles-stack.css`). Per the bundle README, the prototype was **recreated** in
the app's real stack (Next.js App Router + React Server Components) rather than
copied verbatim.

## What was built

| File | Role |
|---|---|
| `apps/web/lib/stack-explainer.ts` | Server-side data access — wraps the M5 backend, maps to serializable view shapes. Mirrors `lib/github-import.ts`. |
| `apps/web/app/stack/layout.tsx` + `stack.css` | IBM Plex fonts + the design system (scoped to `.screen`). |
| `apps/web/app/stack/_components/chrome.tsx` | `AppNav`, `Badge`, `GitHubMark`, and the design's inline icons. |
| `apps/web/app/stack/page.tsx` | `/stack` — the chooser (Server Component). |
| `apps/web/app/stack/[owner]/[repo]/page.tsx` | The Stack Explanation page shell (Server Component). |
| `…/[repo]/_components/stack-explainer-flow.tsx` | The Client Component island — trigger flow + Decision Map + Alternatives Comparison + key-files / debug lists. |
| `…/[repo]/actions.ts` | `explainStackAction` Server Action. |
| `loading.tsx` / `error.tsx` (both routes) | Route loading skeletons + error boundaries. |

## Adaptations from the prototype

- **Tokens scoped to `.screen`**, dark mode rekeyed from `[data-theme="dark"]`
  to the app's `.dark` class, fonts wired to `next/font`, keyframes namespaced
  `stack-*` — the same adaptations the M11 / M3 pages document.
- **The prototype's mock action became a real Server Action.** `explainStack`
  (#86) + `saveStackExplanation` (#87) run server-side in `runExplain`; the page
  never touches the Anthropic SDK. The page reads any stored explanation via
  `getStackExplanationByRepo` (#87) in the Server Component.
- **Icons** were recreated as inline SVGs (the prototype's exact paths) rather
  than pulled from `lucide-react`, so the UI stays pixel-faithful regardless of
  the installed lucide version.
- **`StackTool` has no `category` field** in the real schema (the prototype's
  mock data did). The Decision Map's category chip is conditionally rendered —
  it simply does not appear, which the spec allowed.
- **`not-imported`** is rendered by the Server Component at load time (it is a
  load-time fact, not an action outcome); the other four error kinds
  (`missing-api-key`, `unrecognized-stack`, `llm-failure`, `unknown`) are
  in-page states inside the Client flow.
- **`unrecognized-stack`** is detected with a deterministic `detectStack`
  pre-check in `runExplain` — a snapshot with zero detected tools fails fast
  with no API call.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` — all pass.
- Routes smoke-tested against a freshly migrated `catalog.db`: `/stack` renders
  the empty state; `/stack/[owner]/[repo]` renders the `not-imported` state for
  an unimported repo. The full explained flow needs an imported repo +
  `ANTHROPIC_API_KEY` (environment-dependent).

## Follow-ups

- The local `catalog.db` needed `pnpm --filter @workspace/db db:migrate` to gain
  the M11 `repo_snapshots` / M5 `stack_explanations` tables — the dev DB
  predated those migrations. Fresh clones get them from the migration run.
- File references in the key-files / debug lists render as monospace text, not
  links — there is no in-app file viewer route yet (a future task).
