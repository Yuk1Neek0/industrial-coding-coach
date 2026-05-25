# Integration notes — Challenge Panel

Issue: #138 · Epic: `issue-based-learning-workspace`
Page Spec: `docs/design/challenge-panel.page-spec.md`
Claude Design prompt: `docs/design/ui-prompts/challenge-panel.prompt.md`
Implementation:
- `apps/web/app/repos/[owner]/[repo]/issues/[issueRef]/_components/challenge-panel.tsx` (Server Component — read-only)

This file closes the **Claude Design round-trip** for this component per
**ADR 0007**. Built from the Page Spec as the authoritative design source —
no live Claude Design call was invoked.

---

## Deviations from the Page Spec

### No functional behaviour — stub only (FR-7, R3)

The panel **renders `challengeConcept` + `challengeType` and an explicit
"Deferred to Milestone 9" message — nothing else.** Specifically:

- no input field, no submit button, no "Start challenge" CTA;
- no scoring, no grading call, no persistence beyond the read of the two
  stub fields;
- no run-time integration with any debug / expand harness — M9 owns
  those.

This is the spec's normative §5 / §6 / §7 / §8 wording, the PRD's FR-7 and
R3, and the M7 epic's "minimal challenge stub only" decision.

### Fields rendered exactly as schema provides

The Page Spec describes `challengeConcept: string` and `challengeType: string`.
The shipped schema makes both **nullable** (`text(...)` without `.notNull()`)
to support the graceful-degradation case where the generation call cannot
produce a meaningful stub. The UI:

- renders the `challengeType` as a small calm `Badge tone="info"` (the spec
  forbids color-coded type semantics, since M9 has not enumerated the
  vocabulary yet);
- renders `challengeConcept` as prose;
- if `challengeConcept` is `null`, shows a quiet "No challenge concept was
  generated for this unit" line — the deferral notice still renders below
  (the spec's "always shown" rule);
- if `challengeType` is `null`, omits the badge.

### Deferral message — always visible

The "Deferred to Milestone 9" notice is rendered as a calm bordered note
**every time the panel renders**, not behind a "Learn more" toggle. This
is the spec's §6 step 4 rule and the PRD's R3 / FR-7 normative wording.

### Visual subduing

The whole panel uses dashed borders on a muted background (`bg-muted`)
so it does not over-promise interactive functionality. This matches the
spec's §6 "single subdued Card" guidance and the spec's exclusion of any
CTA buttons.

### What is not built

- **No input field**, **no submit button**, **no "Coming soon!" placeholder
  button** — every one of these would imply M9 functionality exists today;
  R3 explicitly forbids it.
- **No M9 schema pre-allocation** — the panel reads only the two stub
  fields; the integration layer adds no companion table, no `acceptance_criteria`,
  no `solution_diff_hash`. M9 will land its own migration when it ships.
