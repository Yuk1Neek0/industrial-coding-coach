---
issue: 107
stream: page-specs
started: 2026-05-22T15:10:00Z
status: in_progress
---

# Issue #107 — Project Logic Mapper page specs + Claude Design prompts

Stream A: author the four M6 page specs and their Claude Design prompts (the
UI hand-off gate, ADR 0007). Docs-only — no application code.

## Scope

- Page Specs under docs/design/:
  - project-map-page.md — the Project Map page (host route).
  - architecture-flow-viewer.md — request/data, state, AI-call flow viewer.
  - file-map-explorer.md — the key-file map.
  - debug-path-ui.md — the debug entry points / walkthrough.
- Claude Design prompts under docs/design/ui-prompts/ — one per page.

## Progress

- [ ] Page Spec: Project Map page.
- [ ] Page Spec: Architecture Flow Viewer.
- [ ] Page Spec: File Map Explorer.
- [ ] Page Spec: Debug Path UI.
- [ ] Claude Design prompt: Project Map page.
- [ ] Claude Design prompt: Architecture Flow Viewer.
- [ ] Claude Design prompt: File Map Explorer.
- [ ] Claude Design prompt: Debug Path UI.

## Notes

- The ProjectMap typed shape is described in each spec's section 5 from PRD
  FR-5 / task #102 / task #105 because the exact type is not yet defined in
  code (tasks #102/#105 not yet implemented). Specs flag it as the contract
  task #108 must reconcile against the real exported types.
- Mermaid diagram source is a pipeline output (PRD FR-7); the four specs make
  client-side Mermaid rendering explicit and assign it primarily to the
  Architecture Flow Viewer.
