# Page Spec: Alternatives Comparison

Issue: #88 · Epic: `stack-explainer` (M5) · PRD: `.claude/prds/stack-explainer.md` (FR-3, US-3)

This spec defines the **Alternatives Comparison** UI — the component of the
Stack Explanation page (`docs/design/stack-explanation-page.md`, section 4)
that shows, per tool, what could have been used instead and what would change
if it were. It is the input to the Claude Design prompt
(`docs/design/ui-prompts/alternatives-comparison.md`) and to integration task
#89, and must be human-reviewed before the prompt is run.

It is a **component**, not a standalone route — it renders inside
`/stack/[owner]/[repo]`. Sections mirror the standard page-spec format; where a
section does not apply to an embedded component it says so.

(UI tool: Claude Design — see ADR 0007.)

---

## 1. Name

**Alternatives Comparison** — a per-tool view of the roads not taken: for each
major tool, the alternatives to it and the concrete trade-off of each.

## 2. User goal

> "For each tool my project uses — what *else* could it have used, and what
> would actually be different if it had? I want to answer 'why not X?' in an
> interview without bluffing."

The user reads a tool's alternatives to understand its choice as a *decision*
with trade-offs, not an accident — and to be ready for the follow-up question.

## 3. Target user

**Mia, the job-seeking junior dev.** She did not choose most of these tools —
the AI did. The comparison reframes each tool as a decision she can now reason
about. Trade-offs must be concrete and project-relative ("Prisma would add a
generated client and a schema file" — not "Prisma is heavier"), so she can
speak to *her* project, not parrot a blog post.

## 4. Route(s)

n/a — embedded component, section 4 of `/stack/[owner]/[repo]`. No route,
`loading.tsx`, or `error.tsx` of its own; the host page owns those.

## 5. Data source / contract

Pure presentation — receives loaded data as props, fetches nothing.

```ts
interface AlternativesComparisonProps {
  tools: StackTool[];
}

interface StackTool {
  name: string;
  alternatives: { name: string; tradeOff: string }[];
  // `purpose` / `jobRelevance` are rendered by the Stack Decision Map.
}
```

The component renders each tool's `name` and its `alternatives`. Each
alternative has a `name` and a `tradeOff` — "what would change in this project
if this alternative were used instead". A tool with an empty `alternatives`
array is **omitted** from the comparison (it contributes nothing). The
component shares the same `tools` array as the Stack Decision Map; the two are
complementary views of one dataset.

## 6. Sections / layout

Grouped **by tool**: one group per tool that has at least one alternative.

Each tool group:
1. **Tool heading** — the tool `name`, anchored so the Decision Map's "See
   alternatives →" affordance can jump to it.
2. **Alternatives** — each alternative as a row/card pairing its `name` with
   its `tradeOff`. A two-column read ("Alternative" / "What would change") or
   stacked cards — whichever Claude Design renders cleanest — but the
   alternative's name and its trade-off must be visually paired and the
   trade-off must be the prominent content (it is the actual insight).

Layout: a readable single column; tool groups stacked with clear separation.
On wide viewports alternatives within a group may sit in a 2-up grid, but the
name↔trade-off pairing must never be ambiguous. The component sits under a host
section heading "Alternatives & trade-offs".

There is no global comparison table across all tools — the comparison is
*per tool* (each tool vs. its own alternatives), matching the data and keeping
each decision self-contained.

## 7. Input fields

None — read-only. No forms, no filters, no inputs.

## 8. Primary actions

None required. The tool headings are anchor targets for the Decision Map's
"See alternatives" links; there are no buttons. (An optional "back to decision
map" link per group is acceptable but not required.)

## 9. Loading state

n/a at the component level — the host page's in-progress state and route
`loading.tsx` cover it. The component renders only with real data.

## 10. Empty state

If **no** tool in `tools` has any alternatives, the whole component renders a
single quiet line: "No alternatives were recorded for this stack." — it does
not render an empty heading or frame. (The host page may instead choose not to
render section 4 at all; the integrator decides — but the component must be
safe to render in this case.)

## 11. Error state

n/a — receives valid data or arrays that are empty after filtering; all error
handling is the host page's. The component never throws on a well-typed
`StackTool[]`.

## 12. Success state

The populated comparison is the success state: each tool's alternatives,
paired with their trade-offs, readable group by group. A long `tradeOff` wraps
fully — no truncation, no hover-to-reveal.

## 13. Accessibility notes

- Renders under the host's `<h2>` "Alternatives & trade-offs"; each tool group
  heading is an `<h3>` — ordered, none skipped. Each `<h3>` carries an `id` so
  it is a stable anchor target for the Decision Map's links.
- Alternatives are a list (`<ul>`/`<li>`) or a `<table>` with proper
  `<th>` scope if a tabular layout is chosen; the name↔trade-off relationship
  is conveyed structurally, not by layout proximity alone.
- WCAG 2.1 AA contrast in light and dark themes; any column tint is decorative.
- Keyboard and screen-reader order = visual order; anchor links receive focus
  with a visible ring.
- Long trade-off text wraps; nothing meaningful is truncated or hover-gated.

## 14. Acceptance criteria

- [ ] Renders one group per tool that has at least one alternative; a tool with
      no alternatives is omitted.
- [ ] Each group shows the **tool name** and each **alternative** paired with
      its **trade-off**, with the trade-off as the prominent content.
- [ ] Each tool-group heading carries an `id` anchor matching what the Stack
      Decision Map's "See alternatives" affordance links to.
- [ ] When no tool has any alternatives, renders a single quiet line — not an
      empty frame.
- [ ] Uses **only** `packages/ui` (shadcn/ui) components; no fetching — pure
      props.
- [ ] Accessibility notes in §13 are satisfied (ordered anchored headings, list
      or proper table semantics, keyboard, AA contrast).
- [ ] Spec is human-reviewed before the Claude Design prompt is used.
