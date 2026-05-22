---
issue: 107
stream: page-specs
started: 2026-05-22T15:10:00Z
status: completed
---

# Issue #107 — Project Logic Mapper page specs + Claude Design prompts

Stream A: author the four M6 page specs and their Claude Design prompts (the
UI hand-off gate, ADR 0007). Docs-only — no application code.

## Deliverables

Page Specs under docs/design/:
- project-map-page.md — the Project Map page (host route /map, /map/[owner]/[repo]).
- architecture-flow-viewer.md — request/data, state, AI-call flow viewer; owns client-side Mermaid.
- file-map-explorer.md — the key-file map component.
- debug-path-ui.md — the debug entry points / walkthrough component.

Claude Design prompts under docs/design/ui-prompts/ (one per page):
- project-map-page.md
- architecture-flow-viewer.md
- file-map-explorer.md
- debug-path-ui.md

## Progress

- [x] Page Spec: Project Map page.
- [x] Page Spec: Architecture Flow Viewer.
- [x] Page Spec: File Map Explorer.
- [x] Page Spec: Debug Path UI.
- [x] Claude Design prompt: Project Map page.
- [x] Claude Design prompt: Architecture Flow Viewer.
- [x] Claude Design prompt: File Map Explorer.
- [x] Claude Design prompt: Debug Path UI.

## Acceptance criteria (task 107)

- [x] Page Specs under docs/design/ for all four UI pieces.
- [x] A Claude Design prompt under docs/design/ui-prompts/ for each.
- [x] Specs cover how the seven pipeline outputs map onto the four pages,
      including client-side Mermaid diagram rendering — see project-map-page.md
      section 5 (seven-output mapping table) and architecture-flow-viewer.md
      sections 5, 9, 11 (client-side Mermaid).
- [x] Specs reference the typed pipeline output shape — the ProjectMap
      interface is defined in project-map-page.md section 5 (derived from PRD
      FR-5/FR-6/FR-7 and tasks #102/#105 since no code type exists yet); the
      three component specs each reference it and render their slice; every
      spec flags that task #108 must reconcile it with the real exported type.

## Notes

- ProjectMap typed shape is described from the PRD/epic because the exact
  TypeScript type is not yet defined in code (tasks #102/#105/#106 not yet
  implemented). Each spec explicitly tells task #108 to reconcile it.
- Mermaid diagram source (PRD FR-7, pipeline output 6) is rendered client-side;
  the Architecture Flow Viewer owns this — including the per-diagram render
  state and a render-failure fallback that never hides the text step list.
- This is the UI hand-off gate (ADR 0007): the specs require human review
  before the Claude Design prompts are run; task #108 is now unblocked on the
  docs side.
