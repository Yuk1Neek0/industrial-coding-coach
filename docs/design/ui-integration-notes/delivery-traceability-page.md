# Integration Notes: Delivery Traceability Page

Issue: #205 · Epic: `ccpm-integration` (M12) · Page Spec:
`docs/design/delivery-traceability-page.page-spec.md`

What shipped when `/delivery/[owner]/[repo]` was integrated into `apps/web`, and
the decisions/trade-offs a future M12-touching change should know.

## What shipped

- `apps/web/lib/delivery.ts` — server-side facade: `getDeliveryPageData(owner,
  repo)` over the M12 `getDeliveryMap` + M11 `getImportedRepo`. Read-only,
  offline. Mirrors `lib/portfolio.ts`.
- `apps/web/app/delivery/[owner]/[repo]/page.tsx` — the Server Component page
  (`force-dynamic`), rendering the populated map or the degradation state.
- `_components/chrome.tsx` — page-local chrome (AppNav + "Delivery" entry, Badge,
  icons), mirroring the M10 chrome.
- `loading.tsx`, `not-found.tsx`, `error.tsx` (`"use client"`).
- `apps/web/lib/delivery.test.ts` — 3 cases (missing snapshot / map+links /
  degradation).

Verification: `pnpm --filter web typecheck` ✓ · `vitest run lib/delivery.test.ts`
3 passed ✓ · `pnpm --filter web lint` ✓ (one pre-existing warning in
`learning-units.test.ts`, not from this change) · `pnpm --filter web build` ✓
(the route compiles as `ƒ` server-rendered).

## Drift-watch (§5 of the spec — M8 retro lesson)

The shipped types in `packages/db/src/ccpm` were diffed against the §5 shapes
before binding. **No drift** — the page binds to `DeliveryMapResult`,
`CcpmTraceabilityMap`, `CcpmPrdNode`, `CcpmEpicNode`, `CcpmTaskNode`,
`CcpmTeaching`, `CcpmDegradationTeaching`, and `CcpmIssueLink` exactly as the
spec declared (these are the shapes shipped by #200/#201/#202/#203).

## Decisions & trade-offs

- **No separate Claude Design draft was run.** Per the human-in-the-loop call on
  this task, the page was implemented **directly from the Page Spec** + the
  shipped `apps/web` patterns (the same reconciliation an integrator does with a
  Claude Design draft). The Page Spec is the authoritative contract; the Claude
  Design prompt (`docs/design/ui-prompts/delivery-traceability-page.md`) remains
  available for a future visual refresh.
- **Teaching renders as an always-visible "How to read this" panel**, not
  per-node popovers/disclosures. This keeps the page fully server-rendered (no
  client islands) and matches the M10 Portfolio page's always-visible section
  style. The per-node teaching disclosure from the spec (§6b) is a deferred
  visual enhancement; the teaching content (all four concepts, parameterized) is
  present and accessible. **Follow-up:** wire per-node teaching popovers if a
  future pass adds the interaction.
- **Heading hierarchy:** PRD = `<h3>`, epic = `<h4>`, task = list item with
  `<strong>` (a leaf, like the M10 memory-tree leaves) — rather than the spec's
  literal "task = `<h4>`" — to avoid a too-deep heading chain under the `<h2>`
  section headings. Semantic nesting is preserved via nested `<ul>`/`<li>`.
- **Issue links are constructed deterministically** as
  `https://github.com/{owner}/{repo}/issues/{n}` (the snapshot doesn't store the
  issue html_url); the closing-PR link uses the stored `closingPrUrl`.
- **Nav:** a "Delivery" entry was added to `AppNav` (points at `/import`, the
  same placeholder the per-repo Portfolio/Challenges entries use). The unifying
  nav pass across milestones remains an unscoped follow-up.
