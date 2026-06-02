---
name: ccpm-integration
description: Read a repo's CCPM artifacts into a local traceability map (PRD→Epic→Task→Issue→PR) and coach the spec-driven workflow, degrading gracefully for non-CCPM repos.
status: backlog
created: 2026-06-02T12:57:29Z
---

# PRD: ccpm-integration

## Executive Summary

M12 teaches a job-seeking junior developer how a project was actually
*delivered*, not just what it contains. When an imported repository was built
with a spec-driven workflow (CCPM — `.claude/prds/`, `.claude/epics/`), the
coach parses those artifacts into a **delivery traceability map**: PRD → Epic →
Task → GitHub Issue → PR. On top of that map it adds a **teaching layer** that
explains *why* the workflow is shaped that way (why requirements live in files,
why an epic decomposes into bounded tasks, why traceability matters in a
professional team).

Because the product's real users build AI-assisted repos that almost never use
CCPM, M12's headline behavior for the common case is **graceful degradation**:
when no spec-driven workflow is detected, the coach says so plainly and pivots
to an educational explainer about what CCPM is and why a hiring manager values
it — connecting back to the "Agentic CCPM Workflow" Golden Path (M2).

This is dogfooding made visible: the coach can read *this very repository's*
CCPM history and turn it into interview-ready narrative.

## Problem Statement

A junior developer who vibe-coded a project can often describe *features* but
cannot describe *process*. In interviews, "how did you manage and ship this
work?" is a routine question, and "I asked the AI and committed what it gave me"
is a weak answer. They lack the vocabulary and the evidence: which requirement
drove which change, how work was scoped, how a task traces to a merged PR.

Meanwhile, projects that *do* use a spec-driven workflow (CCPM, BMAD, GitHub
Spec Kit) bury that process in `.claude/` files and GitHub metadata that the
user never reads as a narrative. The traceability exists but is invisible and
unexplained.

Today the coach (through M11) imports a repo's code and (through M7) turns
individual issues into learning units, but nothing reconstructs the **delivery
spine** — the chain from requirement to shipped change — or coaches the user to
explain it. M12 fills that gap.

## User Stories

### US-1 — See the delivery traceability map (CCPM repo)
**As** a junior dev whose imported repo uses CCPM,
**I want** to see a map linking each PRD to its epic, its tasks, and the GitHub
issues/PRs that closed them,
**so that** I can explain end-to-end how a requirement became shipped code.

**Acceptance criteria:**
- Given an imported snapshot containing `.claude/prds/` and `.claude/epics/`,
  the coach renders a navigable map with nodes for PRDs, epics, tasks, and the
  linked GitHub issue/PR for each task.
- Each edge reflects a real link in the source files: epic→PRD via the epic's
  `prd:` field; task→issue via the task's `github:` field; PRD→epic by
  shared feature name / `prd` reference.
- A task with no `github:` link is shown as "not synced", not dropped or shown
  as an error.

### US-2 — Understand *why* the workflow is shaped this way (teaching layer)
**As** a junior dev reading the map,
**I want** plain-language explanations of each artifact type and the workflow it
encodes,
**so that** I can answer "why did this project work this way?" in an interview.

**Acceptance criteria:**
- Each artifact type (PRD, epic, task, issue link) has a beginner-first
  explanation of its purpose and its place in the spec-driven flow.
- Explanations reference the *actual* artifact in front of the user (e.g. this
  epic decomposed into N tasks, M of which ran in parallel), not generic boilerplate.
- The teaching content names the professional value (traceability, bounded
  work, reviewable scope) a hiring manager cares about.

### US-3 — Link tasks to live issue/PR status (at import)
**As** a junior dev,
**I want** each task in the map annotated with the real state of its GitHub
issue and the PR that closed it,
**so that** the map reflects what actually shipped, not just what was planned.

**Acceptance criteria:**
- During import, for each task carrying a `github:` issue reference, the M11
  GitHub client fetches issue state (open/closed) and the linked closing PR (if
  any), persisting it into the local snapshot.
- All linking data is stored locally; viewing the map afterward makes **no**
  network calls (ADR 0009 local-first).
- The four M11 boundary errors (invalid/not-found/rate-limited/auth) plus a
  generic fallback degrade to a clear "couldn't link issue status" annotation on
  the affected node — the map still renders from local CCPM files.

### US-4 — Graceful degradation for a non-CCPM repo (the common case)
**As** a junior dev whose imported repo has no `.claude/` workflow,
**I want** the coach to tell me plainly that no spec-driven workflow was found
and teach me what one is,
**so that** I learn the concept and know how to adopt it, instead of hitting a
dead end.

**Acceptance criteria:**
- When no CCPM artifacts are detected in the snapshot, the coach shows a clear
  "no spec-driven workflow detected" state — never an error or empty crash.
- The state includes an educational explainer of CCPM (what PRD/epic/task/issue
  traceability is and why it matters) and links to the "Agentic CCPM Workflow"
  Golden Path (M2).
- Detection is explicit and reported: the user can see *what* was looked for
  (`.claude/prds/`, `.claude/epics/`) and that it was absent.

### US-5 — Coach this repository's own delivery (dogfood)
**As** a user pointing the coach at the Industrial Coding Coach repo itself,
**I want** the full traceability map of its real milestones,
**so that** the project demonstrates the workflow it teaches.

**Acceptance criteria:**
- Importing this repository produces a map covering its archived and active
  epics with their PRD links and task→issue links.
- The map handles the real shapes present here: epics with no `github:` set,
  archived epics under `.claude/epics/archived/`, and PRDs with no epic yet.

## Functional Requirements

### FR-1 — CCPM artifact detection
Detect, from a local snapshot's file tree, whether the repo uses CCPM by the
presence of `.claude/prds/*.md` and/or `.claude/epics/*/epic.md`. Detection
result (present/absent + what was searched) is a first-class, reported value.

### FR-2 — Artifact parsing
Parse the frontmatter and body of PRDs, epics, and tasks per the CCPM
conventions schema (PRD: name/description/status/created; epic:
name/status/progress/prd/github; task: name/status/depends_on/parallel/
conflicts_with/github). Parsing is tolerant of missing optional fields and of
the `archived/` subtree.

### FR-3 — Traceability graph construction
Build a deterministic graph: PRD nodes, epic nodes (linked to PRD via `prd:`),
task nodes (children of their epic), and issue/PR leaf annotations (via task
`github:`). Output is a typed structure suitable for both UI rendering and
narrative generation.

### FR-4 — Live issue/PR linking (import-time, local-first)
For each task with a `github:` reference, use the M11 read-only GitHub client to
resolve issue state and the closing PR, persisting the result into the local
snapshot. No network access at view time. Reuse M11's typed `GitHubResult`
boundary-error model.

### FR-5 — Teaching layer
Produce beginner-first explanations of each artifact type and the overall
spec-driven flow, parameterized by the actual artifacts (counts, parallelism,
status), with explicit "why this matters professionally" framing.

### FR-6 — Graceful degradation
When FR-1 reports absent, surface a non-error "no spec-driven workflow detected"
state carrying the CCPM educational explainer and a link to the M2 Agentic CCPM
Golden Path.

### FR-7 — Typed data-access layer
Expose the parsed map and degradation state through a typed data-access layer
(consistent with M7/M11 patterns) that the UI consumes via a Server Action /
Server Component, never reading raw files in the client.

### FR-8 — Snapshot coverage for CCPM files
Ensure the CCPM artifact **contents** (not just tree entries) are available in
the local snapshot. If M11's key-file selection does not already capture
`.claude/prds/**` and `.claude/epics/**`, extend the import to include them.

## Non-Functional Requirements

- **Local-first (ADR 0009):** GitHub is contacted only at import time; the map
  and teaching views read solely from the local snapshot.
- **Read-only:** only GET requests to GitHub; never writes to the user's repo.
- **Beginner-first copy:** explanations avoid jargon-without-definition and
  never surface raw HTTP codes or stack traces (consistent with M11).
- **Deterministic core:** graph construction and detection are pure/deterministic
  and unit-tested; only the teaching-narrative phrasing may be LLM-generated, and
  if an LLM call is used it is a bounded call on the shared `llm-foundation`
  client with a file-reference integrity check (no artifacts invented).
- **Type safety:** boundary failures are discriminated result values, not thrown
  control flow (M11/M7 convention).
- **Performance:** parsing and graph build complete within an interactive
  budget for a typical repo (tens of PRDs/epics); no per-task network calls at
  view time.

## Success Criteria

- A CCPM repo imports into a traceability map where **100% of epics resolve to
  their PRD** and **100% of synced tasks resolve to their GitHub issue**, with
  unsynced tasks shown as "not synced" rather than dropped.
- Importing **this repository** produces a complete map across its active +
  archived epics with no crash on real-world shapes (missing `github:`,
  archived subtree, PRD-without-epic). Verified as an explicit test case.
- A **non-CCPM repo** never errors: detection reports "absent" and the
  educational degradation state renders, linking to the M2 Golden Path —
  verified by an automated test with a snapshot lacking `.claude/`.
- Every artifact type in the map carries a beginner-first explanation that
  references the actual artifact (count/status/parallelism), confirmed by review
  against the acceptance criteria.
- Viewing the map after import makes **zero** network calls (asserted by test or
  documented verification).
- All new deterministic modules (detection, parsing, graph) ship with passing
  Vitest coverage; CI (lint, build, typecheck, tests) is green on the PR.

## Constraints & Assumptions

- Builds on **M11** (snapshot schema, `repo_snapshots`/`repo_files`, read-only
  GitHub client, typed data-access) and **M7** (issue fetching on the M11
  client, learning-unit patterns). Reuse before building new.
- Assumes the CCPM conventions schema (`.claude/skills/ccpm/references/conventions.md`)
  as the parse target; repos using a *different* spec workflow (BMAD, Spec Kit)
  are treated as non-CCPM for M12 (detection returns absent → degradation).
- Assumes a task's GitHub linkage is expressed via its `github:` frontmatter
  field, as CCPM sync writes it.
- Local-first and read-only are non-negotiable architectural constraints
  inherited from ADR 0009.
- Any LLM use must go through the shared `llm-foundation` client; no new model
  integration.
- UI surface (new page vs. enriching the M7 workspace) is intentionally
  **deferred to the epic** technical-planning phase.

## Out of Scope

- **Importing/parsing non-CCPM spec workflows** (BMAD, GitHub Spec Kit, Jira,
  Linear). M12 detects their absence-of-CCPM and degrades; it does not parse them.
- **Inferring a pseudo-traceability chain** from raw issues/PRs/commits when no
  CCPM exists (the user chose graceful-degradation, not best-effort inference).
- **Full PR diff / commit analysis** — that overlaps M8 (Diff Review) and M11's
  deferred PR/diff import; M12 links to a PR's identity/state, it does not
  analyze its contents.
- **Writing or modifying** any CCPM artifacts or GitHub issues/PRs — strictly
  read-only.
- **Re-implementing issue fetching** — reuse the M7/M11 GitHub client.
- **Choosing the final UI layout** — owned by the epic, after a Page Spec if a
  new page is introduced (CLAUDE.md v0/Claude Design rule).
- **Team/classroom assignment** of workflows — that is M15.

## Dependencies

- **M11 — GitHub Integration:** snapshot schema + `repo_files`, read-only GitHub
  client (`GitHubResult` boundary model), typed data-access layer, `/import` flow.
- **M7 — Issue-Based Learning Workspace:** issue fetching layered on the M11
  client; learning-unit data/UI patterns to mirror.
- **M2 — Golden Path Catalog:** the "Agentic CCPM Workflow" Golden Path entry
  that the degradation state links to.
- **`llm-foundation`:** shared Anthropic SDK client, *iff* the teaching-narrative
  phrasing is LLM-generated rather than templated.
- **CCPM conventions schema:** `.claude/skills/ccpm/references/conventions.md`
  as the authoritative parse target.
- **packages/db (Drizzle):** snapshot persistence; a migration is likely needed
  to store CCPM artifacts + issue/PR link annotations (note the parallel-epic
  migration-collision lesson from M11/M3).
