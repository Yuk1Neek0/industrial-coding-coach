# ADR 0008 — Parallel Execution Model

- **Status:** Accepted
- **Date:** 2026-05-20

## Context

The project's work decomposes into epics → tasks (GitHub issues). The
maintainer wants to run work in parallel rather than strictly one stream at a
time.

Milestone 2 showed where parallelism actually lives: of its six tasks, only one
(#33) could run in parallel — the rest were a dependency chain
(#29 → #30 → #31/#32 → #34) or shared the `packages/db` files. **Tasks inside an
epic are mostly chained or file-sharing; epics are the natural parallel unit** —
different epics touch different areas, and the dependency graph is mostly
within an epic.

"Sub-agents vs sessions vs worktrees" is not an either/or: worktrees are the
*isolation* layer, sub-agents/sessions are the *worker* layer.

## Decision

Parallelize at the **epic** level, isolated by **git worktrees**, with
**sub-agents** as the within-epic workers.

### Isolation — one worktree + branch per epic

```bash
git checkout main && git pull origin main
git worktree add ../icc-<epic> -b epic/<epic-name>
```

Worktrees live at `../icc-<epic>/` (sibling to the repo). One `epic/<name>`
branch per epic. This is CCPM's own convention (`references/sync.md` already
creates an epic worktree).

### Execution — default: one orchestrator + background sub-agents

Within an epic, one orchestrating session runs the dependency-ordered tasks and
spawns background sub-agents (`Agent` with `run_in_background`) for tasks that
are `parallel: true` and not in each other's `conflicts_with`. Sub-agents must
not run git — the orchestrator commits, to avoid races.

### Execution — heavy: multiple sessions

Optional: for hands-on co-driving of two epics at once, run one Claude Code
session per epic worktree. Higher throughput, but the maintainer babysits each
session.

### Integration — epics land via pull requests

Each epic branch merges to `main` through a PR (`epic/<name>` → `main`). This
restores the `→ PR → CI → review` step the development plan specifies.

## Rules

- Never run parallel writers in the same worktree on overlapping files —
  `conflicts_with` exists to prevent this.
- Dependency-chained tasks stay sequential regardless of mechanism.
- Do not over-fan-out: sub-agents start cold and re-derive context; parallelism
  pays for substantial, independent, multi-file work — not tiny tasks.
- Parallelism is capped by **human review bandwidth**, not the machine. Do not
  open more parallel epics than the maintainer can review.

## Consequences

- **Effective from Milestone 3 onward.** M0–M2 ran single-stream with commits
  directly on `main`; they are not retrofitted.
- Epic work moves off direct-to-`main` commits onto `epic/<name>` branches +
  PRs. `main` has no branch protection (ADR 0004), so the branch/PR flow is
  enforced by convention.
- `CLAUDE.md` records the model so any session or agent follows it.
- Near-term: **M3 (Template Registry)** and **M5 (Stack Explainer)** are
  independent → they can run in parallel worktrees. **M4 (Recommendation
  Engine)** depends on M3 → it follows M3.
- When an epic completes, its worktree is removed and the branch deleted after
  merge (CCPM's merge/cleanup flow).

## Amendment — 2026-05-21

During M3/M5 PRD planning, the scope of **M5 (Stack Decision Explainer)** was
settled as explaining the stack of the user's **actual GitHub repository**. That
makes M5 depend on **M11 (GitHub Integration)** for remote repo import — so M5
is no longer independent of the repo-import milestone, and the original
"M3 ∥ M5" near-term pairing in the Consequences section no longer holds.

**Revised near-term pairing:** **M3 (Template Registry) ∥ M11 (GitHub
Integration)** run in parallel worktrees — they are genuinely independent
(curated catalog data vs. ingestion infrastructure). **M4** still follows
**M3**. **M5** now follows **M11**. The epic-level / worktree / sub-agent
execution model decided in this ADR is unchanged — only the specific milestone
pairing is revised.

M11 is pulled forward from "Future Milestone" status by this amendment. See
`.claude/prds/template-registry.md` and `.claude/prds/github-integration.md`.
