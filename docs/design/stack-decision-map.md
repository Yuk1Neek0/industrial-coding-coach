# Page Spec: Stack Decision Map

Issue: #88 · Epic: `stack-explainer` (M5) · PRD: `.claude/prds/stack-explainer.md` (FR-3, US-1, US-2, US-4)

This spec defines the **Stack Decision Map** UI — the centerpiece component of
the Stack Explanation page (`docs/design/stack-explanation-page.md`, section 3).
It is the input to the Claude Design prompt
(`docs/design/ui-prompts/stack-decision-map.md`) and to integration task #89,
and must be human-reviewed before the prompt is run.

It is a **component**, not a standalone route — it renders inside
`/stack/[owner]/[repo]`. Sections below mirror the standard page-spec format;
where a section does not apply to an embedded component it says so.

(UI tool: Claude Design — see ADR 0007.)

---

## 1. Name

**Stack Decision Map** — a tool-by-tool view of a project's stack: every major
tool, what it does *in this project*, and why it matters for the job market.

## 2. User goal

> "Walk me through my stack one tool at a time. For each one: what is it doing
> in *my* project, and why should I care about it as someone looking for a
> job?"

The user scans the map to build a mental model of the whole stack, then reads
any single tool's card to be able to explain that tool out loud.

## 3. Target user

**Mia, the job-seeking junior dev.** She thinks in concrete terms: "the thing
that makes the pages" rather than "the rendering framework". The map must let
her glance at the shape of the stack *and* drill into one tool without losing
her place. Each tool's purpose is phrased as something she could say in an
interview.

## 4. Route(s)

n/a — embedded component. It renders in section 3 of
`/stack/[owner]/[repo]`. No route, no `loading.tsx`, no `error.tsx` of its own;
the host page owns route, loading, and error concerns.

## 5. Data source / contract

The component is **pure presentation** — it receives already-loaded data as
props from the host page and fetches nothing.

```ts
interface StackDecisionMapProps {
  tools: StackTool[];
}

interface StackTool {
  name: string;          // e.g. "Next.js"
  purpose: string;       // what it does in THIS project, plain language
  jobRelevance: string;  // why it matters for the job market
  alternatives: { name: string; tradeOff: string }[]; // rendered elsewhere
}
```

The map renders `name`, `purpose`, and `jobRelevance`. The `alternatives`
array is **not** rendered here — it belongs to the Alternatives Comparison
(`docs/design/alternatives-comparison.md`); the map may show a count or a "See
alternatives" affordance that links/scrolls to it, but not the trade-offs
themselves. This keeps the two UIs from duplicating content.

## 6. Sections / layout

A list of **tool cards**, one per `StackTool`, in the order given (the backend
orders them by category then name, so related tools sit together).

Each tool card shows:
1. **Tool name** — prominent heading, optionally a small category chip
   (framework, database, testing, …) when the host passes one; if no category
   is available, just the name.
2. **Purpose** — the `purpose` text: what this tool does in this project,
   plain language. This is the card's main content.
3. **Job relevance** — the `jobRelevance` text, visually set apart (e.g. a
   tinted callout or a labelled "Why it matters for jobs" line) so it reads as
   a distinct, interview-oriented note rather than more description.
4. **Link to alternatives** — a quiet affordance ("See alternatives →") that
   jumps to this tool's entry in the Alternatives Comparison, when alternatives
   exist for it.

Layout: a single readable column of cards on mobile; an optional two-column
grid on wide viewports is acceptable but cards must stay full-width-readable —
prefer clarity over density. The whole component sits under a section heading
"Stack decision map" provided by the host page.

## 7. Input fields

None — the component is read-only. No forms, no inputs.

## 8. Primary actions

- **See alternatives** — per card, scrolls/links to the matching tool in the
  Alternatives Comparison. Optional per card (only when that tool has
  alternatives). No other actions.

## 9. Loading state

n/a at the component level — the host page's in-progress state (explanation
being generated) and route `loading.tsx` cover loading. The component is only
ever rendered with real `tools` data. The integrator must not invent a
separate skeleton here.

## 10. Empty state

If `tools` is empty (a degenerate explanation — the detection found nothing),
the component renders a single quiet line: "No major tools were identified for
this project." It does not render an empty grid. In practice the host page
shows the `unrecognized-stack` error before reaching this, so this is a
defensive fallback.

## 11. Error state

n/a — the component receives valid data or an empty array; all error handling
is the host page's (`docs/design/stack-explanation-page.md` §11). The component
never throws on a well-typed `StackTool[]`.

## 12. Success state

The populated map *is* the success state: a scannable column of tool cards,
each independently readable. A card with an unusually long `purpose` stays
readable (wraps, no truncation that hides meaning).

## 13. Accessibility notes

- The component renders under the host's `<h2>` "Stack decision map"; each tool
  card's name is an `<h3>` — ordered, none skipped. The map is a `<ul>`/`<li>`
  list or a list of `<article>`s.
- The job-relevance callout is conveyed by a visible label and text, not color
  alone; if a category chip is shown it has a text label.
- Cards are reachable and readable by keyboard and screen reader in DOM =
  visual order; the "See alternatives" control is a real link/button with a
  visible focus ring.
- WCAG 2.1 AA contrast in light and dark themes; the callout's tint is
  decorative only.
- Long content wraps; nothing meaningful is hidden behind truncation or hover.

## 14. Acceptance criteria

- [ ] Renders one card per `StackTool`, in the given order.
- [ ] Each card shows the tool **name**, its **purpose** in this project, and
      its **job-relevance** note as a visually distinct element.
- [ ] The card does **not** render the alternatives' trade-offs (those belong
      to the Alternatives Comparison); a "See alternatives" affordance links to
      them when present.
- [ ] An empty `tools` array renders a single quiet "no tools identified" line,
      not an empty grid.
- [ ] Uses **only** `packages/ui` (shadcn/ui) components; no fetching — pure
      props.
- [ ] Accessibility notes in §13 are satisfied (ordered headings, list
      semantics, keyboard, AA contrast, text-not-color).
- [ ] Spec is human-reviewed before the Claude Design prompt is used.
