# docs/ — Workflow Filesystem

This is the project's workflow filesystem: where specs, designs, decisions,
testing notes, reviews, retrospectives, and archives live.

> **Note:** The plan designates **Copier** as the official initializer for this
> structure. No suitable Copier template existed at foundation time, so this
> structure was created manually as an approved overlay. Adopting/authoring a
> Copier template is a tracked follow-up — see
> [`decisions/0002-workflow-filesystem.md`](decisions/0002-workflow-filesystem.md).
> Do not invent an alternative structure.

## Folders

| Folder | Purpose | Source of truth for |
|---|---|---|
| `current/` | Snapshot of current project state and active focus | "where are we now" |
| `milestones/` | Milestone status docs; root `updated_*plan.md` files are the master plans | milestone scope & status |
| `specs/` | Product / feature specifications | what to build |
| `design/` | UI page specs; `v0-prompts/` and `v0-integration-notes/` for UI work | UI intent & v0 traceability |
| `decisions/` | Architecture Decision Records (ADRs), numbered `NNNN-title.md` | why a choice was made |
| `testing/` | Test plans, manual test notes, verification logs | test strategy |
| `review/` | Review notes and checklists | review outcomes |
| `retrospectives/` | Per-milestone retrospective notes | lessons learned |
| `archive/` | Superseded docs kept for history | historical record |

## Rules

- Delivery state (PRDs, epics, tasks) lives in CCPM (`.claude/prds/`,
  `.claude/epics/`) and GitHub Issues — **not** here.
- UI issues must produce a Page Spec in `design/` before any v0 prompt.
- v0 prompts go in `design/v0-prompts/`; integration notes in
  `design/v0-integration-notes/`.
- Decisions that affect architecture, tooling, or workflow get an ADR in
  `decisions/`.
