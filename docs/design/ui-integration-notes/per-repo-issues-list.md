# Integration notes — Per-repo Issues List

Issue: #138 · Epic: `issue-based-learning-workspace`
Page Spec: `docs/design/per-repo-issues-list.page-spec.md`
Claude Design prompt: `docs/design/ui-prompts/per-repo-issues-list.prompt.md`
Implementation:
- `apps/web/app/repos/[owner]/[repo]/issues/page.tsx` (Server Component)
- `apps/web/app/repos/[owner]/[repo]/issues/{not-found,error,loading}.tsx`
- `apps/web/lib/learning-units.ts` → `getIssuesPageData`

This file closes the **Claude Design round-trip** for this page per
**ADR 0007**. Built from the Page Spec as the authoritative design source —
no live Claude Design call was invoked.

---

## Deviations from the Page Spec

### Data source — both surfaces present (R1)

The Page Spec says the row shape is `LearningUnitInput` produced by `listIssues`
from #132. The implementation goes further to honor **R1 fully**: both GitHub
issues (via `listIssues` from `@workspace/db/github`) AND CCPM tasks (via
`listCcpmTasks` from the same package) are read and folded into one row list,
treated uniformly. The `source` label distinguishes them quietly. The status
join (`LearningUnitSummary`) is computed by reading all `learning_units` rows
for the snapshot and joining client-locally — the data-access layer (#135)
does not yet expose a `listLearningUnitsForRepo` summary endpoint, so the
integration layer composes it from `listLearningUnits`. This matches the
spec's §5 contract on the rendered shape.

### Status derivation (R6)

The three-state badge (`Not started` / `In progress` / `Scored`) is derived
strictly from `learning_units` columns, per the spec's §5 normative rules:

- `scored` when `score` is non-null;
- `in progress` when no score AND (any `userAnswers` OR any `checklistState`
  with `checked: true`);
- `not started` otherwise (including when no row exists at all).

The badge text is the primary signal (color is supplementary — AA contrast
both themes).

### GitHub-fetch failure handling (NFR Resilient + ADR 0009)

When GitHub is unreachable (no network, missing/invalid `GITHUB_TOKEN`,
rate-limit hit), the page renders an inline notice and falls back to the
CCPM tasks read from the snapshot. The notice carries the typed error
message and a hint to set `GITHUB_TOKEN`. The list never goes blank.
This matches spec §11.

### Field-naming differences (schema is authoritative)

The Page Spec describes `LinkedPrRef` with `number` / `title` / `url` /
`state`. The shipped `IssueModel.linkedPrs` is `number[]` — only the
numbers, no title/url/state. The row UI renders "PR #{n}" or
"N linked PRs" as a single soft badge. The full PR detail (title, URL,
state) lives on the M8 Diff Review pages.

The Page Spec describes `IssueLabel` with `name` / `color` / `description`.
The shipped `IssueModel.labels` is `string[]` (names only). The UI renders
each label as a small "info" Badge with the text only — color is supplied
by the theme tokens, not by `label.color`, mirroring the spec's "color
supplementary" rule.

### What is not built

- **No client-side filter bar** (§7). The page renders the full list
  server-side, ordered (open first, then closed; lexicographic within each
  state). Adding a filter island is straightforward but the spec marks it
  optional and the M7 release does not require it; the result count is
  rendered in the header anyway.
- **No global cross-repo issues route** (R5 normative). The route tree is
  scoped to `/repos/[owner]/[repo]/issues/...` — no sibling `/issues`.
- **No write surface** (ADR 0009). The "View on GitHub" link in the
  header is the only external link; rows themselves only navigate to
  the learning unit.
- **No issue creation, no triage, no label editing** — read-only per
  ADR 0009.
