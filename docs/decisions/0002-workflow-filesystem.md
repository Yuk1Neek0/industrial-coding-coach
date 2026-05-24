# ADR 0002 — Workflow Filesystem

- **Status:** Accepted — implementation tracked in `tools/copier-foundation/` (added 2026-05-24)
- **Date:** 2026-05-20

## Context

The plan designates **Copier** as the official initializer for the `docs/` and
`.github/` workflow filesystem, to avoid ad-hoc folder sprawl. At foundation
time (Milestone 0) no project-appropriate Copier template existed, and authoring
one was out of scope for the foundation pass.

## Decision

Create the `docs/` structure and `.github/` templates manually as an **approved
foundation overlay**, with the structure and folder purposes documented in
`docs/README.md`. The structure mirrors what a Copier template would generate:

```
docs/{current,milestones,specs,design,decisions,testing,review,retrospectives,archive}/
docs/design/{v0-prompts,v0-integration-notes}/
.github/ISSUE_TEMPLATE/
.github/PULL_REQUEST_TEMPLATE.md
.env.example
```

## Consequences

- The structure exists now and unblocks Milestone 0.
- **Follow-up (tracked):** author or adopt a Copier foundation template that
  reproduces this structure, so future projects generate it consistently. Until
  then, agents must not invent an alternative structure — extend this one.
- `.gitkeep` files keep otherwise-empty folders under version control.

### Follow-up resolution (2026-05-24)

The Copier foundation template now lives at `tools/copier-foundation/` and
reproduces this structure for new projects. See
[`tools/copier-foundation/README.md`](../../tools/copier-foundation/README.md)
for usage and the one documented rename (`design/v0-prompts/` and
`design/v0-integration-notes/` → `design/ui-prompts/` and
`design/ui-integration-notes/`, reflecting ADR 0007's switch from v0 to
Claude Design). The ADR's example block above is the original sketch and is
preserved as historical context.
