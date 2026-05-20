# ADR 0007 — UI Generation Tool: Claude Design

- **Status:** Accepted
- **Date:** 2026-05-20

## Context

The development plan (section 7) mandates **v0** as the UI-generation tool for
interface issues: Page Spec → v0 prompt → v0 draft → Claude Code integration.

v0 is a separate third-party product with its own account and billing, and the
round-trip is a manual copy-paste.

Anthropic Labs released **Claude Design** (research preview, April 2026): a
conversational design tool (chat + canvas) available on Pro / Max / Team /
Enterprise plans. It can **link the project repository** so generated designs
use the repo's real components and design system, and it exports directly to
Claude Code ("Handoff to Claude Code" / "Send to Claude Code Web" / standalone
HTML / `.zip`).

## Decision

Use **Claude Design** as the UI-generation tool, in place of v0.

The UI workflow is otherwise unchanged — the *discipline* the dev plan requires
stays, only the tool changes:

```
Page Spec (docs/design/)  →  UI prompt (docs/design/ui-prompts/)
  →  Claude Design (maintainer: link repo, generate, iterate on canvas)
  →  export / Handoff to Claude Code
  →  Claude Code integration  →  notes in docs/design/ui-integration-notes/
```

The design folders are renamed to be tool-neutral:
- `docs/design/v0-prompts/` → `docs/design/ui-prompts/`
- `docs/design/v0-integration-notes/` → `docs/design/ui-integration-notes/`

## Rationale

- **Repo-grounded.** Claude Design can link this repository, so drafts use the
  real `packages/ui` (shadcn/ui) components instead of inventing primitives.
- **First-class handoff.** "Handoff to Claude Code" makes the round-trip a
  built-in feature, not a manual paste.
- **Anthropic-native.** One fewer third-party account; consistent with the
  rest of the stack.
- The page-spec-first rule, the stored prompt, and the integration notes —
  the parts that make UI work reviewable and traceable — are all retained.

## Consequences

- v0 is no longer used; the dev plan's "v0" references are superseded by this
  ADR (the page-spec-first discipline is unchanged).
- Claude Design is a **research preview** — it may change; accepted risk.
- UI issues still require a Page Spec before any prompt is run.
- Claude Design usage is subscription-based (Pro/Max/Team/Enterprise) — see
  Anthropic's "Claude Design subscription usage and pricing" for the exact
  relationship with Claude Code usage.
- The tool radar is updated: Claude Design adopted; v0 moved to Hold.
