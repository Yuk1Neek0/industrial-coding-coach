---
name: product
status: completed
created: 2026-05-20T18:53:03Z
updated: 2026-05-20T19:10:07Z
progress: 100%
prd: .claude/prds/product.md
github: https://github.com/Yuk1Neek0/industrial-coding-coach/issues/21
---

# Epic: product

## Overview

Operationalize the Milestone 1 product reframing. The Product PRD
(`.claude/prds/product.md`) defines *what the product is and for whom* — an
open-source, local-first, web-based coach that helps job-seeking junior devs
understand, review, debug, and explain their AI-assisted projects.

This epic turns that definition into the concrete, reusable artifacts that
M2–M11 will depend on: a detailed user persona, a competitive teardown, a
success-metrics tree, the reframed repo-facing docs, open-source readiness, and
the Milestone 2 entry point. **No product code** — M1 is a definition milestone.

## Architecture Decisions

- No new architecture in M1. The product is built on the M0 foundation
  (shadcn/ui Next.js monorepo, CCPM, CI) and ADR 0005 (LLM integration).
- Confirmed product constraints (from the PRD): open-source (MIT), local-first,
  web-only UI in `apps/web`, optional read-only GitHub connection (M11).

## Technical Approach

### Frontend Components

None in this epic. UI work begins in later milestones, and (per the v0 rule)
only after page specs.

### Backend Services

None in this epic.

### Infrastructure

- Open-source readiness: `LICENSE` (MIT, added), `CONTRIBUTING.md`, and making
  the GitHub repository public. Going public also re-enables branch protection
  and CodeQL (see ADR 0004) — revisit those when public.

## Implementation Strategy

Each task produces a definition artifact (a spec doc or a docs update). Tasks
001–003 and 005 are independent and parallelizable; 004 is independent; 006 (the
M2 entry point) builds on 001–003. Sequence: do the definition specs first, then
the M2 entry point last so it can cite them.

## Task Breakdown Preview

- 001 — Target-user persona & jobs-to-be-done
- 002 — Competitive positioning teardown
- 003 — Success-metrics tree
- 004 — Reframe README + CLAUDE.md to the product
- 005 — Open-source readiness (CONTRIBUTING + make repo public)
- 006 — Milestone 2 entry-point spec stub

## Dependencies

- M0 foundation (complete); ADR 0005.
- 006 depends on 001, 002, 003.
- Making the repo public (task 005) is an outward action — gated on explicit
  human go-ahead.

## Success Criteria (Technical)

- Persona, competitive teardown, success-metrics tree, and M2 entry-point specs
  exist under `docs/specs/`.
- `README.md` and `CLAUDE.md` describe the reframed product accurately.
- `LICENSE` and `CONTRIBUTING.md` exist; repo-visibility decision is recorded.
- No product code is written; M1 stays a definition milestone.

## Estimated Effort

~0.5 working day. Six small (XS–S) definition tasks.

## Tasks Created

Synced to GitHub 2026-05-20 — see `github-mapping.md`.

- [x] #22 - Target-user persona & jobs-to-be-done (22.md, parallel: true)
- [x] #23 - Competitive positioning teardown (23.md, parallel: true)
- [x] #24 - Success-metrics tree (24.md, parallel: true)
- [x] #25 - Reframe README + CLAUDE.md to the product (25.md, parallel: true)
- [x] #26 - Open-source readiness (CONTRIBUTING + make repo public) (26.md, parallel: true)
- [x] #27 - Milestone 2 entry-point spec stub (27.md, parallel: false)

Total tasks: 6
Parallel tasks: 5
Sequential tasks: 1
Estimated total effort: ~4 hours
