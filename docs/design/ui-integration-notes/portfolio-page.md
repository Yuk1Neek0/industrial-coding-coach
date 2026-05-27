# Integration notes: Portfolio Page

Issue: #184 · Page Spec: `docs/design/portfolio-page.page-spec.md` (#178) ·
ADR 0007 (Claude Design — `docs/decisions/0007-ui-generation-tool.md`).

This file records the deviations between the Page Spec (#178) and the
shipped React implementation at
`apps/web/app/portfolio/[owner]/[repo]/page.tsx`. Per ADR 0007, the
Claude Design round-trip is **Page Spec → Claude Design prompt → Claude
Design draft → integration notes**; task **#184** ships the integration
notes documenting deviations (the Claude Design draft itself is a manual
external step, not invoked by Claude Code). The lifecycle file exists
from task **#178** so the round-trip is traceable from the start.

TODO — fill at task #184 (Wave 4 integration into apps/web).
