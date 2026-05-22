# Page Spec: Stack Explanation

Issue: #88 · Epic: `stack-explainer` (M5) · PRD: `.claude/prds/stack-explainer.md` (FR-3, FR-4, US-1…US-6)

This spec defines the **Stack Explanation page** — the main UI of Milestone 5,
the Stack Decision Explainer. It is the input to the Claude Design prompt
(`docs/design/ui-prompts/stack-explanation-page.md`) and to the integration
task #89. It must be human-reviewed before the prompt is run.

The page composes two UIs specified separately, both rendered inside it:
- the **Stack Decision Map** (`docs/design/stack-decision-map.md`), and
- the **Alternatives Comparison** (`docs/design/alternatives-comparison.md`).

(UI tool: Claude Design — see ADR 0007.)

---

## 1. Page name

**Stack Explanation** — a per-repository page where the user picks an imported
repo, triggers a stack explanation, and reads why the project uses the
technology stack it does.

## 2. User goal

> "I built this project with a lot of AI help. I can run it, but in an
> interview I can't say *why* it uses Next.js, or Drizzle instead of Prisma, or
> what half these tools even do. Show me — tied to my actual files — so I can
> explain and defend it."

The user opens the page for one of their imported repositories, triggers the
explanation, waits while it is generated, and lands on a readable breakdown:
every major tool with its purpose in *this* project, alternatives and
trade-offs, job-market relevance, the key files to inspect, and where to start
debugging.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years' experience, one or
two AI-built portfolio projects she cannot confidently explain.

Design implications:
- **Plain language, no lecturing.** Explanations are about *her* project, not a
  framework tutorial. Copy is concrete ("Next.js renders the routes under
  `apps/web/app/`"), never generic ("Next.js is a React framework").
- **The explanation takes a few seconds.** It is an LLM call; the in-progress
  state is first-class — she must never wonder whether the page froze.
- **Trust through grounding.** Every claim points at a real file. Mia should be
  able to click from a file reference to the file and see it is real.
- **One concept at a time.** The page is long; it is sectioned and scannable so
  she can read it tool by tool, not as a wall of text.
- **Errors teach.** A missing API key, an unrecognized stack, or an SDK failure
  is explained in beginner terms with a next step — never a raw stack trace.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the shell with a
small Client Component island for the trigger interaction.

| Route | Purpose | File |
|---|---|---|
| `/stack` | Pick an imported repository to explain | `apps/web/app/stack/page.tsx` |
| `/stack/[owner]/[repo]` | The Stack Explanation page for one repo | `apps/web/app/stack/[owner]/[repo]/page.tsx` |

- `/stack` is a thin **chooser**: a list of imported repositories (from the M11
  data-access layer), each linking to its explanation page. It is the entry
  point reachable from primary navigation ("Explain a Stack").
- `/stack/[owner]/[repo]` is the page this spec is mainly about. It has two
  resting states — *not yet explained* (shows the trigger) and *explained*
  (shows the result) — plus in-progress and error states.
- A route-level `loading.tsx` covers the initial server read of the persisted
  explanation. The *explanation generation* in progress is separate in-page
  state (§9).
- `error.tsx` covers unexpected render-time failures only; expected failures
  (no API key, unrecognized stack, SDK error) are in-page error states (§11).

## 5. Data source / contract

The page is a **thin view** over the M5 backend. The shell is a Server
Component that reads any persisted explanation; the trigger is a small Client
Component island calling a Server Action. The page never calls the Anthropic
SDK directly — the Server Action does (PRD: server-side only).

```ts
// Server Component read — does this repo already have an explanation?
getStackExplanationByRepo(owner: string, repo: string, ref?: string)
  : Promise<StackExplanation | null>;

// Server Action — runs the bounded explanation call and persists the result.
explainStackAction(input: { owner: string; repo: string; ref?: string })
  : Promise<StackExplanationActionResult>;
```

`explainStackAction` wraps the `explainStack` call (#86) and
`saveStackExplanation` (#87): on success it persists the explanation and
returns it; on a typed failure it returns a renderable error. Expected
failures are returned, never thrown.

### Explanation shape

A `StackExplanation` the result view renders:

| Field | Type | Used by |
|---|---|---|
| `tools` | `StackTool[]` | The Stack Decision Map + Alternatives Comparison |
| `keyFiles` | `{ path: string; reason: string }[]` | "Key files to inspect" section |
| `debugEntryPoints` | `{ location: string; guidance: string }[]` | "Where to start debugging" section |
| `updatedAt` | `string` (ISO) | "Explained <time>" line; offer to re-explain |

A `StackTool` is `{ name, purpose, alternatives: { name, tradeOff }[],
jobRelevance }`. The Decision Map renders `name` / `purpose` / `jobRelevance`;
the Alternatives Comparison renders `alternatives`.

### Error shape

The Server Action result is discriminated; a failure carries a `kind`:

| `kind` | Meaning |
|---|---|
| `not-imported` | No snapshot — the repo was never imported (link to `/import`) |
| `missing-api-key` | `ANTHROPIC_API_KEY` is not configured |
| `unrecognized-stack` | The snapshot's stack could not be detected at all |
| `llm-failure` | The explanation call failed (rate limit, network, SDK error) |
| `unknown` | Any other failure |

## 6. Page sections

`/stack/[owner]/[repo]`, top to bottom:

1. **Page header** — `owner/repo` as the title, the imported `ref` as a
   `Badge`, and a one-line description: "Why this project uses the stack it
   does — explained against its actual files."
2. **Trigger / status region** — when no explanation exists, an "Explain this
   stack" call to action with a one-line description of what will happen. When
   one exists, a quiet "Explained <relative time>" line with a secondary
   "Re-explain" action. While the call runs, the in-progress state (§9). On
   failure, the error state (§11).
3. **Stack Decision Map** — once explained, the tool-by-tool decision map (its
   own spec: `docs/design/stack-decision-map.md`). This is the centerpiece.
4. **Alternatives Comparison** — alternatives and trade-offs per tool (its own
   spec: `docs/design/alternatives-comparison.md`).
5. **Key files to inspect** — a list of `keyFiles`: each `path` (monospace,
   linkable to the file) and its `reason`. Proof the explanation is tied to
   real code.
6. **Where to start debugging** — a list of `debugEntryPoints`: each `location`
   and its `guidance` — the "if something breaks, look here" map.

Sections 3–6 appear only in the explained state. The `/stack` chooser route is
a simple list of imported repos with an empty state (§10).

## 7. Input fields

There is no free-text input. The only interactive control on
`/stack/[owner]/[repo]` is the **Explain this stack** / **Re-explain** trigger
button (§8). The `/stack` chooser has no inputs — it is a list of links.

## 8. Primary actions

- **Explain this stack** — primary button, shown when no explanation exists.
  Calls `explainStackAction`. Disabled while a call is in progress.
- **Re-explain** — secondary action, shown in the explained state; re-runs the
  call and replaces the stored explanation (the backend updates in place).
- **Try again** — shown in the error state; re-runs the trigger.
- **Import a repository** — shown in the `not-imported` error and the `/stack`
  empty state; links to `/import`.
- File references in §5/§6 are **links** to the file where a destination
  exists; otherwise plain monospace text (the integrator decides — do not link
  nowhere).

No destructive actions — the page never deletes a snapshot or an explanation.

## 9. Loading state

Two distinct kinds:
- **Route load** — `loading.tsx` for `/stack/[owner]/[repo]`, a skeleton of the
  header and section frames, while the persisted explanation is read.
- **Explanation in progress** — after the trigger is pressed, the status region
  (section 2) shows a first-class in-progress state: a heading "Explaining the
  <owner>/<repo> stack…", an indeterminate `Progress` indicator, and a
  reassurance line "Reading your project's files and writing the explanation.
  This usually takes 10–30 seconds." The trigger button shows a loading state
  and is disabled. The region is `aria-live` with `aria-busy="true"`.

## 10. Empty state

- **`/stack` with no imported repositories** — a friendly empty state: "No
  repositories imported yet. Import one to get a stack explanation." with an
  "Import a repository" action to `/import`.
- **`/stack/[owner]/[repo]` not yet explained** — this is a *resting* state,
  not an error: the header plus the "Explain this stack" trigger and a sentence
  on what it produces. Sections 3–6 are absent until an explanation exists.

## 11. Error state

Expected failures are **in-page error states** in the status region (section
2), each with a heading, a plain-language explanation, and a recovery action:

- **`not-imported`** — heading "This repository isn't imported yet".
  Explanation: a stack explanation needs an imported snapshot. Action: "Import
  this repository" → `/import`.
- **`missing-api-key`** — heading "AI explanation isn't configured".
  Explanation: the explanation is generated by an AI model and needs an
  `ANTHROPIC_API_KEY` set in the project's `.env` file (read server-side only);
  point to `.env.example`. No key is ever collected in the UI.
- **`unrecognized-stack`** — heading "We couldn't recognize this project's
  stack". Explanation: no major tools were detected in the snapshot's package
  and config files; the repo may not be a JS/TS project, or its key files
  weren't imported. Suggest re-importing.
- **`llm-failure`** — heading "The explanation couldn't be generated".
  Explanation: the AI request failed (it may be a rate limit or a temporary
  network problem); a "Try again" action.
- **`unknown`** — heading "Something went wrong". A short friendly catch-all
  and a "Try again" action. No raw stack trace, status code, or payload shown.

Every error state renders as text in the `aria-live` region (announced; text +
icon, not color alone). A failed re-explain keeps the previously stored
explanation visible below the error rather than blanking the page.

## 12. Success state

After a successful explanation (or on load when one is already stored), the
page renders the explained state: the "Explained <time>" line, then the Stack
Decision Map, the Alternatives Comparison, the Key files list, and the
Debugging entry points. The result is persistent — it stays until the user
re-explains. A partial result (file references that did not all resolve) still
renders; the integrator may surface a quiet "some references could not be
verified" note, but never blocks the explanation.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` (the `owner/repo` title); section
  headings descend in order (`<h2>` for sections 2–6, `<h3>` within) with no
  skipped levels. `<main>`, `<nav>`, `<section>` landmarks. The key-files and
  debug-entry lists are `<ul>`s; file paths are `<code>`.
- **Status region is a live region.** Section 2 is `aria-live="polite"`; the
  in-progress state sets `aria-busy="true"`. Trigger → in-progress → success /
  error transitions are announced without a focus jump.
- **Loading.** The progress indicator is decorative; the announced information
  is the in-progress heading text.
- **States announced.** In-progress, success, and every error message are real
  text content — never color-only or icon-only.
- **Keyboard.** Full keyboard operability with a visible focus ring: Tab
  reaches the trigger, the re-explain / try-again actions, and every file link;
  Enter/Space activate. DOM order = visual order.
- **Color & contrast.** WCAG 2.1 AA in light and dark themes (`next-themes`).
  The `ref` badge and error states convey meaning by text + icon, not color.
- **Long content.** Section 3–6 headings let assistive tech and keyboard users
  jump tool-section to tool-section; the page is navigable, not one long blob.

## 14. Acceptance criteria

- [ ] `/stack` lists imported repositories with a link to each one's
      explanation page, and shows the empty state (with an Import action) when
      none are imported.
- [ ] `/stack/[owner]/[repo]` renders a header (`owner/repo` + `ref` badge) and,
      when not yet explained, an "Explain this stack" trigger.
- [ ] Triggering shows a first-class **in-progress state** (heading, progress
      indicator, reassurance line) with the button disabled while it runs.
- [ ] A successful explanation renders the **Stack Decision Map**, the
      **Alternatives Comparison**, the **Key files to inspect** list, and the
      **Where to start debugging** list.
- [ ] An already-explained repo renders its stored explanation on load, with an
      "Explained <time>" line and a **Re-explain** action.
- [ ] **Error** state covers `not-imported`, `missing-api-key`,
      `unrecognized-stack`, `llm-failure`, and a generic fallback — each with a
      distinct heading, plain-language explanation, and recovery action. No raw
      stack traces or status codes.
- [ ] The page reads from the typed backend (`getStackExplanationByRepo`,
      `explainStackAction`) — it renders states and never calls the SDK itself.
- [ ] The page uses **only** `packages/ui` (shadcn/ui) components.
- [ ] Accessibility notes in §13 are satisfied.
- [ ] Page spec is human-reviewed before the Claude Design prompt is used.
