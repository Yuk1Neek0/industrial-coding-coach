# M3 — Template Registry MVP

**State:** ✅ Complete — epic #43 done & archived; registry UI live at
`/templates` · **Date:** 2026-05-21

Goal: a structured registry of the real-world templates (building blocks) that
Golden Paths are built on — each one explained, not a black box. Built in
parallel with M11 via git worktrees (ADR 0008).

## Scope decisions

- **Storage:** the `templates` table joins `golden_paths` in the same local
  SQLite store (ADR 0006) — a new table, not a new database.
- **Templates:** all **15** from the milestone plan (3 scaffolds, 4 agentic
  workflows, 1 CI, 3 security, 2 doc/spec, 1 contract, 1 observability).
- **Fit scoring:** the plan lists "template fit scoring" as a deliverable. M3
  *stores* structured fit factors (`fitFactors`); the *scoring* belongs to M4
  (Recommendation Engine). The registry presents fit **qualitatively** — the
  page spec explicitly forbids a numeric 0–100 score.
- **UI:** a Template Registry list page + detail page, deliberately mirroring
  the M2 Catalog so the two read as one product.

## Stage status

| Stage | Description | Status |
|---|---|---|
| 1 | CCPM Plan — PRD `template-registry.md` | Done — approved |
| 2 | CCPM Epic → Structure → Sync | Done — epic #43, tasks #44–#48 |
| 3 | Execution + UI hand-off | Done — see backlog |

## Execution backlog

| Issue | Task | Status |
|---|---|---|
| #44 | Template schema + Drizzle migration | ✅ Done — `11beae0` |
| #45 | Typed template data-access layer + tests | ✅ Done — `b17637c` |
| #46 | 15 template entries + seed + referential-integrity test | ✅ Done — `a028a16` |
| #47 | Template Registry page spec + Claude Design prompt | ✅ Done — `af4c018` |
| #48 | Integrate the Template Registry UI pages | ✅ Done — `426bd71` |

All 5 task issues + epic #43 are closed; the epic is archived to
`.claude/epics/archived/template-registry/`. Merged to `main` via **PR #50**
(`95a1f87`).

## Delivered

- `packages/db` — `templates` table + migration; typed data-access layer
  (`listTemplates`, `getTemplateBySlug`, `listTemplatesByCategory`,
  `resolveTemplates`) with Vitest tests.
- 15 hand-authored, reviewed template entries + idempotent seed + a
  referential-integrity test (every `templatesReferenced` slug resolves).
- Registry UI: `/templates` (grouped/flat views, search + category filter) and
  `/templates/[slug]` (detail with the Template Fit block), with loading /
  error / not-found states, wired to the data-access layer. UI tool: Claude
  Design (ADR 0007) — see `docs/design/ui-integration-notes/`.

## Acceptance Criteria (milestone plan)

- [x] Templates are separated from Golden Paths — a distinct `templates` table.
- [x] Golden Paths reference templates — `templatesReferenced` slugs resolve via
      `resolveTemplates`; the referential-integrity test enforces it.
- [x] Each template explains what it generates, why it is used, risks,
      alternatives, and learning value — every field populated in all 15 entries.

## Retrospective

**What went well**

- The 15 entries are hand-authored and reviewed — no naked LLM output (PRD NFR).
  The referential-integrity test makes a dangling Golden Path → template
  reference a test failure, not a runtime surprise.
- Reusing the M2 Catalog's design system kept the registry visually one product
  with the catalog at near-zero design cost.

**What to watch — lessons**

- **Data-contract drift between an in-epic schema task and a design prompt.**
  The Claude Design prompt (#47) assumed each fit factor carries a coarse
  `strong/moderate/weak` weight; the schema authored in the *same epic* (#44)
  stored `fitFactors` as `{ factor, detail }` — no weight. #48 adapted the UI
  (reasoned factors, no fabricated weights) rather than inventing data. Same
  root cause made `learningNotes` a prose string where the design expected a
  list. **Lesson:** when a page spec / design prompt and a schema task live in
  one epic, pin the UI data contract against the *actual* committed schema
  before the design hand-off — don't let the prompt describe a shape the schema
  doesn't have.
- Task #47's title still said "v0 prompt"; ADR 0007 replaced v0 with Claude
  Design. Cosmetic, but CCPM task titles drifted from the ADRs.

**Cross-cutting (shared with M11)**

- M3 and M11 ran in parallel via git worktrees — both added a Drizzle `0001`
  migration, which collided on merge. The second PR to merge (#50) had to take
  `main` and regenerate the templates migration as `0002` via `drizzle-kit
  generate`. **Lesson:** parallel epics that both touch `packages/db`
  migrations should expect a regenerate-on-merge step — budget for it, or
  serialize the migration-adding tasks.

**Follow-ups**

- M4 (Recommendation Engine) owns scoring against the stored `fitFactors`.
- Linking the M2 catalog detail's `templatesReferenced` chips to
  `/templates/[slug]` is a scoped future task, intentionally out of #48.
