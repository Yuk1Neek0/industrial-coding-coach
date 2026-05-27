# Page Spec: Debug Walkthrough UI

Issue: #146 · Epic: `debug-expansion-challenge` · PRD: `.claude/prds/debug-expansion-challenge.md` (FR-3, FR-4, FR-7, R3, R8, US-3)

This spec defines the **Debug Walkthrough UI** for Milestone 9. It is the input
to the Claude Design prompt (`docs/design/ui-prompts/debug-walkthrough-ui.md`)
and to the integration task #148. It must be human-reviewed before the prompt
is run. (UI tool: **Claude Design** — see ADR 0007.)

The Debug Walkthrough UI is the **answer-entry surface** for an M9 challenge —
the place where the user writes a free-text explanation of which files they
would change and why, optionally with small per-file code snippets keyed to
paths from the M6 project map. **Grading is rendered by its sibling**, the
**Completion Review UI** (`docs/design/completion-review-ui.md`, task #147) —
not here. The two surfaces are specified separately so the answer-entry side
and the grading side evolve independently, mirroring M8's
Understanding Check + Score / Weak Area split (R4).

> **Host route resolved by task #145.** The Challenge Detail Page Spec
> (`docs/design/challenge-detail-page.md`, task #145) resolves whether this
> component sits **inline** on the Detail Page or on **its own sub-route** under
> `apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/...`. This spec
> reads that resolution as authoritative and is written so the component
> behaves identically in either host — it is a component that renders a
> challenge, collects an attempt, and submits it. The route plumbing is the
> Detail Page Spec's responsibility (§4).

---

## 1. Page name

**Debug Walkthrough UI** — the answer-entry component for one M9 challenge: it
displays the active challenge's scope and acceptance criteria, collects a
free-text explanation of which files the user would change and why, optionally
collects small illustrative code snippets keyed to specific M6 project-map
paths, and submits the attempt for grading.

## 2. User goal

> "This challenge asks me to add a small field / trace a failed call / fix a
> schema mismatch in **my** project. Let me write — in plain language — which
> files I'd change and why, against the project's real structure, without
> getting lost. Optionally let me sketch a snippet to make my reasoning clear.
> Then save my answer so I can come back and see how I did."

The user reads the challenge's task, scope, and acceptance criteria; types a
free-text explanation; optionally attaches one or more small code snippets
keyed to specific paths from the M6 project map; submits; and (per US-3) the
attempt is persisted server-side and is retrievable.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She has
an AI-built portfolio project she cannot confidently explain. She can prompt
an AI tool, run `pnpm`, and push to GitHub, but cannot yet say "I'd touch
these files" with confidence.

Design implications:

- **Words first, code optional.** The primary input is **a free-text
  explanation** (FR-4). Mia answers in interview language — "I'd change the
  API handler at `apps/web/app/api/.../route.ts` and the form component in
  `apps/web/components/...` because the field flows through both" — not by
  writing patches. Snippets are an *optional aid*, not the main event.
- **Honest about what is graded.** The grader scores **the explanation
  only** (R3 / FR-7). Snippets are illustrative context and are **not** scored
  for style, naming, or plausibility. Mia must see this clearly while
  answering — not buried in a tooltip — so she does not waste effort polishing
  snippet code expecting it to move the score.
- **Project-grounded picker.** The file-path picker is **restricted** to paths
  the M6 project map explicitly names (R8). She can't free-type an arbitrary
  path; if a path isn't in the M6 map, she can't attach a snippet to it.
  Off-map references are rejected by the integrity check anyway (FR-6); the
  UI prevents the dead end at entry time.
- **Scope is visible while answering.** The active challenge's **in-scope**
  and **out-of-scope** file/module sets stay visible on the page while she
  writes (R8 / FR-3). She does not have to scroll away from her answer to
  re-read the boundary.
- **A practice run, not an exam.** Tone is calm and supportive — no timer, no
  pass/fail stamp on entry, no penalty. M9 is the comprehension check, not a
  proctored test.
- **No accounts, no setup.** M9 has no authentication; attempts persist by
  challenge id and are retrievable by URL.

## 4. Route(s)

**The host route is resolved by task #145's Challenge Detail Page Spec.**
That spec is the single place that decides between:

- **Inline host** — this component renders inside
  `apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/page.tsx` (the
  Challenge Detail Page) as the "Your walkthrough" section, immediately
  beneath the challenge brief; **or**
- **Sub-route host** — this component owns its own sub-route, e.g.
  `apps/web/app/repos/[owner]/[repo]/challenges/[challengeId]/walkthrough/page.tsx`,
  linked from the Detail Page's "Answer this challenge" action.

Either way, the user reaches this surface from the Challenge Detail Page for
a specific `challengeId`, with the active challenge already loaded by the
host. The Detail Page is, in turn, reached from the Challenge List Page
(task #144).

This component is a **Client Component island** — it holds the explanation
text, the optional snippets, and the chosen file paths in local state, and
submits through a **server action** (no API route — ADR 0006) that calls the
task-001 (#140) data-access layer to persist the attempt. Suggested home,
regardless of inline vs sub-route:
`apps/web/components/challenges/debug-walkthrough.tsx`. Final placement is
the integrator's call (task #148).

A loading UI, error boundary, and not-found behaviour for the host route are
owned by the host (task #145's Detail Page Spec, or a sub-route `loading.tsx`
/ `error.tsx` if the resolution is sub-route). This component contributes
**in-component** in-progress and error states (§9, §11) for the submit
action.

## 5. Data source / contract

The component **receives the active challenge and any prior attempt as
props** — it does no fetching. The host (the Challenge Detail Page, task
#145) loads them via the M9 data-access layer (`packages/db/src/challenges/`,
task #140); this component renders them and submits a new attempt.

```ts
interface DebugWalkthroughProps {
  /** The active challenge being answered. */
  challenge: Challenge
  /**
   * The user's most-recent stored attempt on this challenge, if any.
   * `null` on a fresh, unanswered challenge — the form is then in its blank,
   * active state. When present, the form is pre-populated with that attempt's
   * explanation, file paths, and snippets so the user can revise — or, if
   * the host decides to lock prior attempts (task #145's call), the
   * component shows the submitted attempt read-only.
   */
  priorAttempt: ChallengeAttempt | null
  /**
   * True when this attempt is locked from further edits — e.g. the user has
   * already submitted and the host has chosen to show the result rather than
   * an editable form. The host (task #145) decides retry semantics (US-6);
   * this component honours the flag.
   */
  locked: boolean
}

// The submit path — a server action wired by the integrator (task #148).
// It calls the M9 attempts data-access layer (task #140), which persists the
// `ChallengeAttempt` row and (when the grading wave is wired by task #148)
// triggers the bounded grading call (task #143).
submitChallengeAttempt(
  challengeId: string,
  input: ChallengeAttemptInput,
): Promise<ChallengeAttempt>
```

### Typed contracts the component renders and produces

These are produced by the M9 generation call (`Challenge`, task #142) and
persisted by the M9 attempts data-access layer (`ChallengeAttempt`, task
#140); they are the typed shapes referenced in the Claude Design prompt
(`docs/design/ui-prompts/debug-walkthrough-ui.md`). The exact TypeScript
lives in `packages/db`; if the merged code differs at integration time the
merged code is authoritative, but the shape is fixed by PRD FR-3 / FR-4 and
must not change without updating this spec.

**`Challenge`** — the typed challenge shape (FR-3):

| Field | Type | Use |
|---|---|---|
| `id` | `string` | stable key — used as the URL fragment for `[challengeId]` and to key attempts |
| `snapshotRef` | `{ owner: string; name: string; ref: string }` | the imported-repo snapshot the challenge is grounded in |
| `type` | `ChallengeType` | one of: `"add-small-field"`, `"trace-failed-call"`, `"fix-schema-mismatch"`, `"add-loading-error-state"`, `"add-unit-test"`, `"explain-broken-ci"`, `"extend-module-safely"` (FR-2) |
| `taskDescription` | `string` | plain-language description of what is being asked, referencing real files/modules in the user's repo |
| `inScopeFiles` | `ProjectMapFileRef[]` | **strictly limited to M6 project-map-named files** (R8) — the files/modules the user is expected to touch |
| `outOfScopeFiles` | `ProjectMapFileRef[]` | **strictly limited to M6 project-map-named files** (R8) — the files/modules the user should *not* touch |
| `acceptanceCriteria` | `string[]` | the criteria the grader will use; surfaced to the user so they know what "done" looks like |
| `mapReferences` | `MapReference[]` | source references into the M6 project map (key-file map / request flow / debug path entries the challenge ties back to) |
| `createdAt` | `Date` | when the challenge was generated (R2 — lazy-per-type, cached-per-snapshot) |

**`ProjectMapFileRef`** — one in-scope or out-of-scope entry:

| Field | Type | Use |
|---|---|---|
| `path` | `string` | the real path in the snapshot (matches an M6 `ProjectMapFile.path`) |
| `role` | `string` | the role this file plays in the project (from M6) — surfaced so the user understands *why* it's in scope |

**`MapReference`** — a citation into the M6 project map:

| Field | Type | Use |
|---|---|---|
| `kind` | `"key-file" \| "request-flow" \| "state-flow" \| "ai-call-flow" \| "debug-path"` | which M6 map section the citation comes from |
| `path` | `string` | the file path the citation points at (always an M6-named path) |
| `note` | `string` | a one-line plain-language note from the project map |

**`ChallengeAttemptInput`** — what the form submits, the typed attempt shape
(FR-4):

| Field | Type | Use |
|---|---|---|
| `explanation` | `string` | **primary input** — the user's free-text explanation of which files they would change and why (FR-4) |
| `filePaths` | `string[]` | the file paths the user said they would change — **picked from the M6 map only** (R8); captured on submit (FR-4) |
| `snippets` | `ChallengeAttemptSnippet[]` | optional per-file illustrative snippets; **not graded** (R3 / FR-7); may be empty |

**`ChallengeAttemptSnippet`** — one optional, illustrative snippet:

| Field | Type | Use |
|---|---|---|
| `path` | `string` | an M6-named path the snippet is keyed to (chosen from the same restricted picker — never free-typed) |
| `code` | `string` | the user's illustrative code — plain text, no execution, no syntax check, **not scored** |

**`ChallengeAttempt`** — a stored attempt read back (the persisted form of
`ChallengeAttemptInput` plus persistence + grading fields, from
`packages/db/src/challenges/`):

| Field | Type | Use |
|---|---|---|
| `id` | `string` | stable attempt key |
| `challengeId` | `string` | the `Challenge.id` this attempt is against |
| `explanation` | `string` | the user's free-text answer (FR-4) |
| `filePaths` | `string[]` | M6-named paths the user committed to changing (FR-4) |
| `snippets` | `ChallengeAttemptSnippet[]` | the user's illustrative snippets (R3 / FR-7) |
| `submittedAt` | `Date` | when the attempt was submitted |
| `grading` | `ChallengeGrading \| null` | the grading result (rendered by the Completion Review UI, **not by this component**); `null` until grading completes |

`ChallengeGrading` (score + weak-area breakdown, M8-shape per R4) is defined
in the **Completion Review UI** spec (`docs/design/completion-review-ui.md`).
This component **does not render it** — on a successful submit the host
yields to the Completion Review UI to render the result. The two specs
together cover the M9 answer-and-grade loop end to end:

> answer entry (this spec) → submit → persisted attempt + grading call →
> graded score / weak-area presentation (`docs/design/completion-review-ui.md`).

The component is guaranteed project-grounded: every path it offers in its
picker, every path it shows in in-scope / out-of-scope, and every path it
captures on submit resolves to a real path in the active challenge's M6
project-map-named set. The M9 integrity check (task #141 / FR-6) provides
the same guarantee server-side; the UI prevents the dead end at entry by
construction.

## 6. Page sections

The component is a single headed section within its host (the Challenge
Detail Page, or its own sub-route — task #145's call). Top to bottom:

1. **Section header** — heading "Your walkthrough" and a one-line description
   "Explain in your own words which files you would change and why. Only your
   explanation is graded; any snippets you attach are notes to yourself,
   not part of the score." A short, honest note that grading is automated
   AI coaching feedback (ADR 0005 + FR-7).
2. **Challenge scope panel — visible while answering (R8).** A compact, calm
   reference panel pinned alongside or above the answer (sticky on wide
   screens, collapsible on mobile but **open by default**) showing:
   - the **active challenge's type and a one-line task summary** (the user
     should not have to scroll back to the brief to know what they're
     answering);
   - the **in-scope files/modules** — `challenge.inScopeFiles` rendered as
     a list of monospace path chips, each with its `role` from M6 as a
     small caption (e.g. ``apps/web/app/api/.../route.ts`` — "request
     handler");
   - the **out-of-scope files/modules** — `challenge.outOfScopeFiles`
     rendered in the same style under a clearly labelled "Out of scope"
     heading;
   - the **acceptance criteria** — `challenge.acceptanceCriteria` as a
     bulleted list ("Done when…").
   This panel is **read-only** — it is the boundary the user is answering
   against, surfaced where they are answering so they don't drift off the
   challenge's scope (R8). It must remain visible while the user writes; it
   is the part of the spec that earns the "in-scope / out-of-scope visible
   while answering" acceptance criterion.
3. **Explanation field — the primary input (FR-4).** A large free-text
   `Textarea` labelled "Explain which files you would change and why." It is
   the headline input on the page, given clearly more visual space than the
   snippets section. A short helper line beneath it: "Plain English — write
   the way you'd answer in an interview. **Only this explanation is
   graded.**" The framing is repeated here, in plain text, so it cannot be
   missed.
4. **Files-you-would-change picker — restricted to M6 paths (R8 / FR-4).**
   A separate, clearly labelled input ("Files you would change") that lets
   the user pick **one or more paths** from the M6 project map for this
   snapshot. This is the typed `filePaths` list the attempt captures on
   submit (FR-4). The picker:
   - is **restricted to the M6 project map's named paths for this
     snapshot** — concretely, every `path` it lists is one of
     `challenge.inScopeFiles[i].path` ∪ `challenge.outOfScopeFiles[i].path` ∪
     `challenge.mapReferences[i].path` (i.e. the project-map-named set the
     challenge ties to), populated from the task-001 (#140) data-access
     layer's snapshot-scoped map accessor. **No free-typed paths are
     accepted** — the input is a select / combobox over a known list, not a
     plain text field.
   - shows each candidate path in monospace with its M6 `role` as a small
     caption, so the user has the same context the scope panel shows.
   - lets the user **add and remove** chosen paths; the chosen list is
     rendered as a row of monospace chips with a clear "remove" affordance
     (`X`-button); each chip carries a small visual hint of whether the
     path is in-scope or out-of-scope (a calm secondary badge, not red — see
     §13). Picking an out-of-scope path is **allowed** (the user might be
     wrong; that's what the grader is for and the score will reflect it);
     this is not a hard block, just a visible cue.
   - on submit, the chosen list is the `filePaths` field of
     `ChallengeAttemptInput` (FR-4).
5. **Optional snippets — illustrative, not graded (R3 / FR-7).** A clearly
   labelled "Optional code snippets (notes to yourself)" section beneath the
   explanation. It is **collapsed by default** (a "+ Add a snippet" button)
   so it never competes for attention with the explanation field. When
   expanded, each snippet row holds:
   - a **path picker** for the snippet's `path`, **using the same restricted
     M6 list** as §4 — **no free-typed paths** (R8); a snippet keyed to an
     off-map path is not representable in this UI;
   - a `Textarea` for the snippet's `code` — monospace font, no syntax
     highlighting required (it is illustrative, not executable, and not
     graded — keeping it plain reinforces that);
   - a "Remove snippet" button.
   At the top of the snippets section, a **prominent inline note**:
   > **Snippets are illustrative — they are not scored for style, naming, or
   > plausibility. Only your explanation above is graded.** *(R3 / FR-7.)*
   This note is real, persistent body text (not a tooltip, not a small icon
   hint) and lives **next to the snippet field** so the framing reaches the
   user where the temptation to over-polish would otherwise strike. Multiple
   snippets are allowed; zero snippets is the expected default.
6. **Submit area** — a primary **"Submit answer"** button and a short
   reassurance line ("Your answer is saved as soon as you submit. Grading
   takes a few seconds."). When the explanation field is empty, submission
   is still allowed (a missed challenge is graded honestly with a low
   score; forcing a non-empty answer would punish a candid "I'm not sure"),
   but a gentle inline note says "Your explanation is empty — you can submit
   anyway." A small "Reset" link clears the form (after a confirm) — useful
   between drafts.
7. **Submitted (read-only) view.** When `priorAttempt` is non-null and
   `locked` is `true` — i.e. the host has decided to show this attempt
   read-only rather than as an editable form (e.g. the user has just
   submitted and the host is showing the result, or task #145's
   retry-semantics call disables further edits for a submitted attempt) —
   the section renders the submitted explanation, file paths, and snippets
   as read-only content beneath the scope panel: no inputs, no submit
   button. The Completion Review UI then renders the grading result
   immediately below (host's call — same surface or under it).
8. **Pre-population for revision.** When `priorAttempt` is non-null and
   `locked` is `false`, the form is pre-populated with that attempt's
   `explanation`, `filePaths`, and `snippets` so the user can revise and
   submit a new attempt (US-6 supports multiple attempts per challenge —
   the task-001 (#140) data-access layer preserves all of them).

## 7. Input fields

The Debug Walkthrough form has three input fields, only the first of which
is the primary, graded input. All three are inside the form (§6.3, §6.4,
§6.5):

| Field | Input | Behaviour |
|---|---|---|
| **Explanation** (FR-4) | `Textarea` — large, headline | The user writes their free-text answer in their own words — "I'd change X because Y, then Z." No length limit enforced in the UI; a soft character counter is optional. This is the **primary** input and is **the only thing graded** (R3 / FR-7). |
| **Files you would change** (FR-4 / R8) | combobox / multi-select over **M6-named paths only** | The user picks one or more paths from a restricted list (the snapshot's M6 project-map-named set). **Free-typed paths are not allowed** — the input has no plain-text fallback. The chosen list is `filePaths` on submit. |
| **Snippets** (R3 / FR-7) | zero or more `{ path picker, code Textarea }` blocks; collapsed by default | Optional, illustrative-only. The `path` picker is the **same restricted M6 picker** as above — never free-typed. The `code` is plain-text and **not graded** for style, naming, or plausibility. |

- The explanation field is labelled by its visible heading; the file-path
  picker and each snippet's fields are programmatically associated with their
  labels.
- Inputs hold state client-side until submit; on submit the component builds a
  `ChallengeAttemptInput` (`explanation`, `filePaths`, `snippets`) and calls
  `submitChallengeAttempt`.
- In the submitted read-only view (§6.7) there are no editable inputs.

## 8. Primary actions

- **Read the scope** — re-read the in-scope, out-of-scope, and acceptance
  criteria pinned in the scope panel (§6.2). Passive but central — the
  panel is the user's anchor while writing.
- **Write the explanation** — type into the explanation `Textarea` (§6.3).
  The core activity.
- **Pick files you would change** — add/remove paths from the restricted
  M6-only picker (§6.4). Captures the typed `filePaths` (FR-4) on submit.
- **Add a snippet (optional)** — expand the snippets section, pick a path
  from the restricted M6-only list, and type illustrative code (§6.5).
  Optional; **not graded**.
- **Submit answer** — the primary forward action: builds a
  `ChallengeAttemptInput`, runs `submitChallengeAttempt`, and on success
  yields to the host to render the persisted attempt (and, once grading is
  wired by task #148, the Completion Review UI's graded result).
- **Reset draft** — clear the form after a confirm; useful between drafts
  on a fresh attempt.
- **Retry / new attempt** — the *trigger* for a retry is on the host (task
  #145's Detail Page Spec decides whether retrying re-uses this component
  in `locked=false` mode with empty pre-population, or in `locked=false`
  with pre-filled prior content). This component honours `priorAttempt` and
  `locked` and does not own the retry decision.

There is no per-field save and no "save draft" — the form submits once as a
unit. The attempt becomes part of the user's history (US-3 / US-6) the
moment the server action completes.

## 9. Loading state

- **Before submit** — the component renders immediately from its
  `challenge` and `priorAttempt` props; there is no fetch, so no skeleton.
  (The host's route-level skeleton is owned by task #145's Detail Page Spec
  or by the sub-route's `loading.tsx`.)
- **During submit** — `submitChallengeAttempt` persists the attempt and
  (once task #148 wires it) triggers a bounded LLM **grading call that takes
  a few seconds** (FR-5, ADR 0005). While it runs:
  - disable every input — the explanation field, the file-path picker, the
    snippet rows — and the submit button; the button shows an in-progress
    label ("Submitting your answer…") with a spinner;
  - show a short status line ("Saving your answer and grading it — a few
    seconds.");
  - keep the typed explanation, picked file paths, and snippets **visible**
    (not replaced by a skeleton) so the user keeps context;
  - the submit region carries `aria-busy="true"` while the action runs.

## 10. Empty state

A fresh, unanswered challenge **is** the empty state — `priorAttempt` is
`null`, every input is blank, the snippets section is collapsed. This is
not a special "no data" screen; it is the form's default active state.

A challenge always has a `taskDescription`, at least one entry in
`acceptanceCriteria`, and at least one entry in `inScopeFiles` (FR-3 / R1 /
R8 — generation produces at least one challenge per applicable type, each
tied to a real file/module path). `outOfScopeFiles` *may* be empty if the
generator legitimately found no adjacent map entries to flag; in that case
§6.2 renders only the "In scope" sub-list and an inline note ("No
out-of-scope files were flagged for this challenge") rather than a bare
heading. The restricted picker's candidate list is the union of in-scope,
out-of-scope, and `mapReferences` paths — by FR-3 that union is non-empty,
so the picker is never empty in normal operation.

Defensive cases:

- If the restricted picker's candidate list is unexpectedly empty, render
  the file-path picker disabled with an inline note ("No M6-named paths
  available for this challenge — try regenerating from the Detail Page")
  rather than a broken input.
- If `challenge.acceptanceCriteria` is empty, the scope panel renders the
  in-scope / out-of-scope lists without a bare "Done when…" heading.

## 11. Error state

- **Validation.** Effectively none: a blank explanation is allowed (§7), a
  blank file list is allowed, zero snippets is the expected default. The
  only inline notes are informational:
  - "Your explanation is empty — you can submit anyway." (near the
    explanation field)
  - "You haven't picked any files yet." (near the file-path picker, after
    first submit if `filePaths` is empty)
  These are gentle hints, not blocks.
- **Restricted-picker selection.** The picker only accepts paths in the M6
  list, by construction — there is nothing for the user to type that could
  produce an off-map path, so there is no validation error here.
- **Submit failure.** If `submitChallengeAttempt` fails (e.g. database
  error; once task #148 wires it, also: no API key, rate limit, or network
  on the grading-call leg — CI runs with no API key, so this path is real
  and must be handled):
  - **do not** treat it as a host-page error and **do not** lose the user's
    work — the typed explanation, picked file paths, and snippets stay in
    the form;
  - re-enable the form and show a calm inline message in the submit area:
    heading "Couldn't save your answer yet", a short explanation ("This can
    happen if the AI grading service is unavailable, or if the local
    database is temporarily inaccessible. Your work is kept — try again."),
    and a **"Try again"** button that re-submits the same input;
  - never show a stack trace; never blow away the inputs.
- **Persistence-only failure.** If the attempt persisted but the grading
  call failed downstream (FR-7 / FR-9 — grading is its own bounded call),
  the host (Completion Review UI / Detail Page) handles the
  no-grading-yet state. From this component's perspective, the submit
  *succeeded* — the attempt is stored (US-3); the grading-failure framing
  belongs to the Completion Review UI (`docs/design/completion-review-ui.md`).
- **Off-map reference defensive case.** If for any reason a path in the
  form's state doesn't resolve against the snapshot's M6 set at submit time
  (it shouldn't, since the picker is restricted), the server action returns
  a structured error and the form shows a calm inline message naming the
  offending path with a "Pick another path" prompt. This mirrors the M9
  integrity check (FR-6) at the UI edge — the page never crashes.

## 12. Success state

- **Active form** — the scope panel (in-scope, out-of-scope, acceptance
  criteria) is visible; the explanation `Textarea` is editable; the
  restricted file-path picker is operable; the snippets section is
  collapsed by default but expandable; the submit button is enabled.
- **On successful submit** — the attempt is persisted by the task-001
  (#140) data-access layer (US-3) and is retrievable. The host (task #145)
  takes over: depending on its resolution, it either keeps the user on the
  Detail Page and renders the Completion Review UI beneath this component
  in `locked=true` read-only mode, or navigates to the result view.
  Either way, **this component reaches its done state by handing off**, not
  by rendering grading itself.
- **A returning user** whose attempt is already submitted — `priorAttempt`
  populated, `locked` set per task #145's call — sees either:
  - the read-only submitted view (§6.7) with the Completion Review UI
    rendering the grading below (when locked); or
  - a pre-populated form they can revise (§6.8) — a new submit creates a
    new `ChallengeAttempt` row (US-6 supports multiple attempts).
- A brief, non-blocking confirmation (an inline note or toast, e.g. "Answer
  saved") may acknowledge the submit; the persisted attempt and its
  grading are the real confirmation.

## 13. Accessibility notes

- **Semantics & headings.** The section has one heading ("Your walkthrough")
  at the level the host page assigns it (an `<h2>` if hosted inline on the
  Detail Page; an `<h1>` if hosted on its own sub-route). The scope panel,
  the explanation, the file-path picker, and the snippets section are
  `<h3>` sub-sections (or `<h2>` if hosted on a sub-route — match the host
  level), with no skipped levels.
- **Lists.** The in-scope, out-of-scope, acceptance-criteria, picked file
  chips, and snippets each render as `<ul>`/`<ol>`. The scope-panel lists
  use `<ul>` with monospace `<code>` for paths.
- **Form labelling.** The explanation `Textarea` has a programmatically
  associated `<label>` ("Explain which files you would change and why").
  The file-path picker is a labelled combobox (`role="combobox"`,
  `aria-expanded`, `aria-controls`, an associated listbox of M6 candidates);
  chosen-path chips are inside a labelled region ("Files you would change")
  with each chip's remove button carrying an accessible name
  ("Remove `apps/web/app/...`"). Each snippet row is a `<fieldset>` with a
  `<legend>` ("Snippet — `<path>`") containing the path picker and the
  code `Textarea`.
- **Grading-framing is announced text, not visual-only.** The "Snippets are
  illustrative — they are not scored…" framing (§6.5) is real, persistent
  body text inside the snippets section — not an icon, not a tooltip-only
  hint. It is read by screen readers in the natural reading order. The same
  framing also appears as plain helper text under the explanation field
  ("Only this explanation is graded.").
- **Scope panel — read-only, programmatically grouped.** The scope panel is
  a labelled region (`<section aria-labelledby="...">`) so screen readers
  identify it as "the active challenge's scope." On mobile, the
  collapse/expand toggle is a real button with `aria-expanded`; the panel
  is **open by default** so the boundary is visible without an extra
  interaction.
- **Restricted picker — selection semantics, not free typing.** The picker
  is a combobox over a known list — it does not present a plain text input
  the user could mistakenly type into. Keyboard support is full combobox
  behaviour: ↑/↓ navigate the listbox, Enter selects, Esc closes,
  type-ahead filters by path substring (this is filtering the *visible
  options*, not freeform path entry — selecting still picks from the M6
  list). The chosen chips are reachable in tab order; each chip's remove
  button is keyboard-operable.
- **In-scope / out-of-scope visual cues.** The in-scope vs out-of-scope
  badge on a picked-file chip conveys meaning by **text** ("in scope" /
  "out of scope") as well as a calm color band — never color alone.
- **Submitting.** The submit region carries `aria-busy="true"` while the
  action runs; the disabled state of inputs and the submit button is
  conveyed by `aria-disabled` (not by color alone), and the in-progress
  label on the button is real text.
- **Submit-failure message** is a real, announced `aria-live` region — it
  appears after an action — and the "Try again" control is a real button.
- **Submitted read-only view.** Submitted answers are exposed as readable
  text (not disabled inputs that a screen reader skips); the transition
  from the form to the read-only view moves focus predictably toward the
  Completion Review UI's heading.
- **Keyboard.** Full keyboard operability in logical (DOM = visual) order:
  the scope-panel collapse toggle, the explanation `Textarea`, the
  file-path picker (combobox + chips + remove buttons), the snippets
  toggle, each snippet's path picker, code `Textarea`, and remove button,
  the reset link, and the submit button. Enter/Space activate; arrow keys
  navigate within combobox/listbox. Visible focus ring throughout.
- **Color & contrast.** WCAG 2.1 AA contrast in light and dark themes (the
  app uses `next-themes`). The "in scope" / "out of scope" badges and the
  submit/in-progress states convey meaning by text, not color alone.
- **Targets.** Inputs, picker options, chips, remove buttons, and the
  submit button are comfortably sized for pointer and touch.

## 14. Acceptance criteria

- [ ] The component renders the active **challenge's scope** (in-scope,
      out-of-scope, acceptance criteria) **visibly while the user
      answers** (§6.2 / R8).
- [ ] The **explanation `Textarea`** is the primary, headline input and is
      labelled as such; the helper text "Only this explanation is graded"
      is plain, persistent body text (FR-4 / R3 / FR-7).
- [ ] The **files-you-would-change picker** is **restricted to the
      snapshot's M6 project-map-named paths** — free-typed paths are not
      accepted by construction (R8 / FR-4).
- [ ] The **optional snippets section** is collapsed by default; each
      snippet uses the **same restricted M6-only path picker** — snippet
      paths are never free-typed (R8 / FR-4).
- [ ] An **inline, persistent, plain-text note** next to the snippet field
      states that snippets are illustrative and **not scored** for style,
      naming, or plausibility (R3 / FR-7). The framing is also surfaced
      as plain helper text under the explanation field — it cannot be
      missed.
- [ ] On submit, the component builds a typed `ChallengeAttemptInput` —
      `explanation` + `filePaths` (the picked M6 paths the user said they
      would change) + `snippets` — and calls `submitChallengeAttempt`,
      which **persists the attempt via the task-001 (#140) data-access
      layer**; the attempt is retrievable (US-3 / FR-9).
- [ ] A **submit in-progress** state covers the few-second bounded
      persistence + grading call: inputs and submit are inert, the button
      shows progress, a reassurance line is shown, the typed answer stays
      visible (§9).
- [ ] On a **successful submit**, the component yields to the host — it
      does **not** render grading itself. The Completion Review UI
      (`docs/design/completion-review-ui.md`, task #147) renders the
      result.
- [ ] A **submit failure** does not lose the user's answer and is **not** a
      host-page error: a calm inline "Try again" message re-submits the
      same input (§11).
- [ ] A **returning user** with a stored attempt sees either the submitted
      read-only view or a pre-populated revisable form, per `locked`
      (§6.7 / §6.8); a new submit creates a new attempt row (US-6).
- [ ] The component **receives `challenge` / `priorAttempt` / `locked` as
      props** — it does **no** data fetching; the submit goes through a
      **server action**, not an API route (ADR 0006).
- [ ] The component reads as one product with the rest of M9 and the M8 +
      M2–M4 pages — shared `packages/ui` components, spacing, and a calm,
      supportive tone.
- [ ] Accessibility notes in §13 are satisfied (heading order, associated
      labels, combobox semantics for the restricted picker, announced
      grading-framing as plain text, AA contrast).
- [ ] The host-route question (inline vs sub-route) is resolved by **task
      #145's Challenge Detail Page Spec** — this spec defers to that
      resolution rather than re-deciding.
- [ ] **Claude Design (ADR 0007) is the UI generation tool — v0 is not
      used.**
- [ ] Page spec is human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #146).
