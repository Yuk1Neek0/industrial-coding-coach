# UI Integration Notes: Project Logic Mapper

Issue: #108 · Epic: `project-logic-mapper` (M6) · Tool: **Claude Design** (ADR 0007)

Records how the four M6 Project Logic Mapper UIs — the Project Map page, the
Architecture Flow Viewer, the File Map Explorer, and the Debug Path UI — were
integrated into `apps/web` and wired to the real M6 backend. Specs:
`docs/design/project-map-page.md`, `architecture-flow-viewer.md`,
`file-map-explorer.md`, `debug-path-ui.md`.

## What was built

| File | Role |
|---|---|
| `apps/web/lib/project-mapper.ts` | Server-side data access — wraps the M6 backend (LangGraph pipeline #105 + project-maps data-access #106), maps results to serializable view shapes. Mirrors `lib/stack-explainer.ts`. |
| `apps/web/app/map/layout.tsx` + `map.css` | IBM Plex fonts + the design system (scoped to `.screen`). |
| `apps/web/app/map/_components/chrome.tsx` | `AppNav` (with a new "Map" link), `Badge`, `GitHubMark`, inline-SVG icons. |
| `apps/web/app/map/_components/util.ts` | `relTime` / `slugify` helpers. |
| `apps/web/app/map/_components/mermaid-diagram.tsx` | The client-side Mermaid renderer (Client Component island). |
| `apps/web/app/map/_components/file-map-explorer.tsx` | The File Map Explorer component (client-side path search). |
| `apps/web/app/map/_components/architecture-flow-viewer.tsx` | The Architecture Flow Viewer component (flow tabs + the Mermaid diagram). |
| `apps/web/app/map/_components/debug-path-ui.tsx` | The Debug Path UI component. |
| `apps/web/app/map/page.tsx` | `/map` — the chooser (Server Component). |
| `apps/web/app/map/[owner]/[repo]/page.tsx` | The Project Map page shell (Server Component). |
| `…/[repo]/_components/map-flow.tsx` | The Client Component island — trigger flow + the three composed component UIs. |
| `apps/web/app/map/actions.ts` | `generateProjectMapAction` Server Action. |
| `loading.tsx` / `error.tsx` (both routes) | Route loading skeletons + error boundaries. |
| `apps/web/lib/project-mapper.test.ts` | Vitest round-trip test — runs the pipeline with a scripted model, no API key. |

## Wiring — pipeline + data-access

- The `/map/[owner]/[repo]` Server Component reads any persisted map with
  `getProjectMap` (#106) and the integrity check with
  `checkProjectMapFileReferences` (#106).
- The trigger Client Component calls the `generateProjectMapAction` Server
  Action → `runMap` in `lib/project-mapper.ts`, which: runs the deterministic
  ingestion (`ingestSnapshotForRepo`, #103), runs the LangGraph mapping
  pipeline (`runMappingPipeline` from `@workspace/ai/mapper`, #105), persists
  the result with `saveProjectMap` (#106), and runs the file-reference
  integrity check. The page never touches the LangChain model itself.
- The Mermaid source from the pipeline is rendered **client-side** by the
  `mermaid` npm library inside `mermaid-diagram.tsx`.

## Adaptations from the spec

- **The spec's `ProjectMap` shape was reconciled with the real exported types**
  — the page spec §5 explicitly directs task #108 to do this. The real
  `ProjectMapContent` (`@workspace/db` / `@workspace/ai/mapper`) is flatter than
  the spec's PRD-derived shape:
  - `keyFileMap` items are `{ path, role }` — there is **no `category` /
    `importance`** field. The File Map Explorer keeps the path search but drops
    the category filter and importance ranking the spec described (the same
    adaptation M5 made for its missing `category` field).
  - The three flows are `FlowStep[]` (`{ order, description, path? }`) — there
    is no per-flow `summary` / `applicable` / `mermaid`. The pipeline emits
    **one shared `mermaidDiagram`** (request/data flow + key files), so the
    Architecture Flow Viewer renders that single diagram once above the flow
    tabs. The AI-call flow's "not applicable" state is detected from the
    pipeline's explicit single-step placeholder.
  - `debugPath` items are `{ location, guidance }` — no separate `symptom` /
    `file`. The Debug Path UI uses `location` as the "Start here" anchor and
    `guidance` as the body.
- **The design system mirrors M5**, not the ui-prompt's shadcn suggestion: the
  M5 Stack Explainer integrated its Claude Design handoff as a self-contained
  CSS design system scoped to `.screen` (not `@workspace/ui` primitives). The
  `/map` route follows the same proven pattern — `map.css` is a port of
  `stack.css` with keyframes namespaced `map-*` and fonts wired to
  `--font-map-*`.
- **No API key at build/test time.** `createAnthropicMapperModel`'s
  `ChatAnthropic` is lazily constructed, so importing the pipeline never needs
  a key; the build collects page data without running the pipeline. The
  Vitest test injects a scripted `MapperModel`. `runMap` accepts an optional
  `CatalogDb` and `MapperModel` for tests — the same injection idiom as the
  `@workspace/db` data-access layer.
- **`missing-api-key`** is detected by inspecting the error thrown by the
  LangChain model (its message names `ANTHROPIC_API_KEY`); the other expected
  failures (`not-imported`, `empty-snapshot`, `pipeline-failure`) are explicit
  pre-checks or a caught pipeline error.
- **File references render as monospace `<code>`, not links** — there is no
  in-app file viewer route yet (the specs allow plain text where no
  destination exists; the same call M5's integration note records).

## Dependencies added to `apps/web`

- `mermaid@^11.15.0` — client-side Mermaid diagram rendering (runtime dep).
- `@workspace/ai` (`workspace:^`) — the M6 mapping pipeline.
- `vitest`, `better-sqlite3`, `drizzle-orm`, `@types/better-sqlite3` (dev) —
  the round-trip test builds an in-memory migrated DB, mirroring the
  `@workspace/db` test fixtures.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` — all pass with **no
  `ANTHROPIC_API_KEY` set**. `apps/web` gained a `test` script (Vitest) and 6
  passing tests.
- Routing is additive: `/map` and `/map/[owner]/[repo]` are new; no existing
  route was modified. (The parallel `diff-review` epic also adds routes —
  conflicts are resolved at epic merge.)

## Follow-ups

- File references in the key-file / flow / debug lists render as monospace
  text, not links — a future in-app file viewer route would make them links.
- The full mapped flow needs an imported repo + `ANTHROPIC_API_KEY`
  (environment-dependent); the routes smoke-test to the `not-imported` /
  resting states without one.
