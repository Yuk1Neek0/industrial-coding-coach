# M12 — CCPM Integration

**State:** ✅ Complete — epic #196 done; merged to `main` via **PR #216**
(`024957b`) · **Date:** 2026-06-02

Goal: turn an imported repository's CCPM artifacts into a local **delivery
traceability map** (PRD → Epic → Task → Issue → PR) with a beginner-first
teaching layer, and degrade gracefully — with an educational explainer linking
the M2 "Agentic CCPM Workflow" Golden Path — for the common case of a repo that
uses no spec-driven workflow.

## Scope decisions

- **Two states, one surface.** Most target-user repos use no spec-driven
  workflow, so the page's primary job for the common case is the
  graceful-degradation educational state (US-4); the populated map is the
  CCPM-repo case (incl. dogfooding this repository).
- **Local-first, read-only (ADR 0009).** GitHub is contacted only at import
  (issue/PR linking); the delivery-map view reads only the local snapshot
  (`repo_files` + `ccpm_issue_links`) — no token, no API key, no network.
- **Deterministic teaching, no LLM (AD-3).** The teaching layer is templated and
  parameterized by the map's real numbers — no SDK call, no integrity surface.
- **Persist only the network-derived data (refined in #209).** Parsed artifacts
  already live in `repo_files` (captured by #199) and are re-derived on read;
  only the issue/PR links (`ccpm_issue_links`) are persisted.

## Stage status

| Stage | Description | Status |
|---|---|---|
| 1 | CCPM Plan — PRD `ccpm-integration.md` | Done — approved (PR #206) |
| 2 | CCPM Epic → Structure → Sync | Done — epic #196, tasks #197–#205 |
| 3 | Execution + UI hand-off | Done — see backlog |

## Execution backlog

| Issue | Task | Closing PR |
|---|---|---|
| #198 | Generalized CCPM parser (PRD + epic + task, incl. `archived/`) | #207 |
| #199 | Snapshot coverage for `.claude/**` (+ fixes M7's empty `listCcpmTasks`) | #208 |
| #197 | `ccpm_issue_links` schema + Drizzle migration `0010` | #209 |
| #200 | Traceability graph + detection + degradation | #210 |
| #201 | Import-time issue/PR linking (local-first) | #211 |
| #202 | Deterministic teaching layer (no LLM) | #212 |
| #203 | Typed data-access layer (`getDeliveryMap`) | #213 |
| #204 | Delivery page — Page Spec + Claude Design prompt | #214 |
| #205 | Integrate the Delivery page into `apps/web` | #215 |

All 9 task issues + epic #196 are closed; the epic is archived to
`.claude/epics/archived/ccpm-integration/`. Merged to `main` via **PR #216**.

## Delivered

- `packages/db/src/ccpm/` — `parse.ts` (PRD/epic/task parser incl. `archived/`),
  `graph.ts` (pure traceability graph + detection/degradation), `teaching.ts`
  (deterministic parameterized teaching), `linking.ts` (import-time issue/PR
  resolution → `ccpm_issue_links`), `index.ts` (the `getDeliveryMap` data-access
  layer + `importRepositoryWithLinks` orchestration). Exported via a new
  `./ccpm` subpath.
- `packages/db/src/schema.ts` — `ccpm_issue_links` table + migration `0010`; new
  `ccpm-prd` / `ccpm-epic` / `ccpm-task` key-file categories so the import
  pipeline captures `.claude/**` artifact bodies.
- Delivery UI: `/delivery/[owner]/[repo]` — a Server Component over the M12 DAL
  (read-only, offline), built from a Page Spec via the Claude Design round-trip
  (ADR 0007) — see `docs/design/ui-integration-notes/delivery-traceability-page.md`.

## Acceptance Criteria (PRD)

- [x] A CCPM repo imports to a map where epics resolve to their PRD and synced
      tasks resolve to their issue; unsynced tasks shown as "not tracked", never
      dropped.
- [x] Importing this repository yields a complete map across active + archived
      epics with no crash on real shapes (missing `github:`, PRD-without-epic).
- [x] A non-CCPM snapshot returns the educational degradation state (US-4) — not
      an error — linking the M2 `agentic-ccpm-workflow` Golden Path.
- [x] Every artifact node carries a beginner-first explanation parameterized with
      real numbers.
- [x] The map view makes zero network calls (links resolved at import; teaching
      deterministic).

## Retrospective

**What went well**

- **Reuse-first paid off.** M12 generalized M7's `parseCcpmTaskFile` and reused
  M11's snapshot pipeline + GitHub client wholesale; the only new external
  surface was one Drizzle migration.
- **A latent M7 bug fell out for free.** #199 revealed that key-file selection
  never captured `.claude/**`, so M7's `listCcpmTasks` returned empty on real
  imports — fixing snapshot coverage made M12's parser *and* M7's path work, with
  a regression test.
- **Clean DAG, fast wall-clock.** Wave-1 (parser / coverage / schema) had no
  interdependencies; each task touched a disjoint file set, so the "one bounded
  issue at a time" discipline never hit a merge conflict.

**What to watch — lessons**

- **Spec ↔ shape drift was avoided** by binding the page to the shipped
  `packages/db/src/ccpm` types and recording a no-drift check in the integration
  notes (honoring the M8 retro lesson).
- **Route convention finalized at spec time.** The epic sketched
  `/delivery/[owner]`, but the DAL keys on owner+repo; the Page Spec corrected
  the route to `/delivery/[owner]/[repo]` to match `getDeliveryMap` and the M10
  `/portfolio/[owner]/[repo]` convention. Sketch routes in epics, finalize in the
  Page Spec.

**Follow-ups**

- The teaching renders as an always-visible panel; per-node teaching popovers
  (Page Spec §6b) are a deferred visual enhancement (no Claude Design draft was
  run — the page was built directly from the spec).
- Closing-PR **titles** are not fetched (only number + URL) to avoid an extra
  GitHub call per task; a future pass could enrich the link annotation.
- A unifying primary-nav pass across M7–M12 remains an unscoped follow-up; each
  milestone's chrome still carries its own `AppNav` copy.
