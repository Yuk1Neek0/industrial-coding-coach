# ADR 0002 — Workflow Filesystem

- **Status:** Accepted
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
