# Page Spec: GitHub Repository Import

Issue: #41 · Epic: `github-integration` · PRD: `.claude/prds/github-integration.md` (FR-6, FR-7, US-1)

This spec defines the **Import UI page** for Milestone 11 (GitHub Integration).
It is the input to the Claude Design prompt
(`docs/design/ui-prompts/github-import-page.md`) and to the integration task
#42. It must be human-reviewed before the prompt is run.
(UI tool: Claude Design — see ADR 0007. The PRD and task #41 say "v0"; per
ADR 0007 the tool is Claude Design — the page-spec → UI-draft hand-off gate is
unchanged.)

---

## 1. Page name

**GitHub Repository Import** — a single-route page where the user supplies a
GitHub repository URL, triggers an import, and watches it complete (or fail).

## 2. User goal

> "I have a portfolio project on GitHub. I want to point this product at it by
> URL, kick off the import, and clearly see whether it worked — and if it
> didn't, I want to know exactly what went wrong and what to do about it."

The user pastes a repo URL, optionally names a branch/tag, presses Import,
watches a progress state while the file tree and key files are fetched, and
lands on either a success result (confirming the right project was imported) or
a specific, actionable error.

## 3. Target user

**Mia, the job-seeking junior dev** (`docs/specs/target-user-persona.md`):
early-career, bootcamp graduate or self-taught, 0–1 years experience. She has
one or two AI-built portfolio projects on GitHub that she cannot confidently
explain. She can prompt an AI tool, run `pnpm`, and push to GitHub, but is not a
GitHub-API expert and has never reasoned about rate limits or token scopes.

Design implications:
- **Plain language over jargon.** "Repository not found", "GitHub rate limit",
  and "authentication failed" must be explained in beginner terms with a
  concrete next step — not surfaced as raw API status codes.
- **The URL is the whole interaction.** Mia thinks in terms of the address bar
  URL she sees on github.com (`https://github.com/owner/repo`), not
  `owner/repo` slugs. The input must accept the full URL she would copy.
- **Import is the product's first network step and can take a few seconds.**
  The in-progress state is first-class — Mia must never wonder whether the page
  froze. She should see that work is happening.
- **Errors must teach, not blame.** When something fails, the copy tells her
  what happened and what to try, so she can self-serve (fix the URL, configure
  a token, wait out a rate limit).
- **No accounts, no setup wizard.** M11 has no authentication UI; a private-repo
  token is configured via `.env` by the maintainer (PRD FR-4, US-4). The page
  references the token only in copy, never collects it.

## 4. Route(s)

Next.js App Router (`apps/web`), React Server Components for the shell, with a
small Client Component island for the interactive import flow.

| Route | Purpose | File |
|---|---|---|
| `/import` | Import a GitHub repository by URL; show progress and result | `apps/web/app/import/page.tsx` |

- Single route — unlike the M2 Catalog this is one page, not a list+detail
  pair. The import form, the in-progress state, the success result, and the
  error states are all states of this one page, not separate routes.
- The page itself loads instantly (it is a form); there is **no route-level
  `loading.tsx`** for `/import`. "Loading" here means the *import operation*
  in progress (see §9), which is in-page state, not a route transition.
- An error boundary (`error.tsx`) covers unexpected render-time failures of the
  route. Expected import failures (invalid URL, not found, rate limit, auth) are
  **in-page error states** (see §11), not the error boundary.
- An "Import" entry should be added to the app's primary navigation (out of
  scope to design here, but the page assumes it is reachable from a nav link).

## 5. Data source / contract

The page is a **thin view** over the typed repo-import data-access layer
(`@workspace/db`, task #40). The interactive flow is a small Client Component
that calls the import action and renders its result. Import is the product's
only network step; everything downstream reads the local snapshot (PRD NFRs).

The page interacts with two operations from the data-access layer:

```ts
// Trigger an import — invoked by the Import button.
// owner/repo is parsed from the submitted URL; ref is the optional branch/tag.
importRepository(input: {
  owner: string;
  repo: string;
  ref?: string;
}): Promise<ImportResult>;

// Look up an already-imported repo to detect a re-import (PRD US-3).
getImportedRepo(owner: string, repo: string, ref?: string): Promise<ImportedRepo | null>;
```

The page does not fetch GitHub directly — it calls the data-access layer (a
server action or route handler decided in integration task #42), which owns the
GitHub client, auth, and rate-limit handling. The UI **renders states**; it does
not implement import logic.

### Import result shape

A successful import resolves to an `ImportResult` the success view renders:

| Field | Type | Used by |
|---|---|---|
| `owner` | `string` | Result header — repository identity |
| `repo` | `string` | Result header — repository identity |
| `ref` | `string` | Result header — the branch/tag imported (resolved default if none given) |
| `defaultBranch` | `string` | Shown when the user imported the default branch |
| `fileCount` | `number` | Result summary — "N files in the tree" |
| `keyFiles` | `{ path: string; bytes: number }[]` | Result summary — the key files whose contents were captured (PRD FR-2) |
| `importedAt` | `string` (ISO) | Result summary — when the snapshot was taken |
| `isReimport` | `boolean` | Result copy — "snapshot refreshed" vs. "repository imported" (PRD US-3) |

### Import error shape

A failed import resolves to (or throws) a typed error the error state renders.
The page must distinguish **four** boundary error kinds (PRD FR-7) plus a
generic fallback:

| `kind` | Meaning | Trigger |
|---|---|---|
| `invalid-url` | The input is not a parseable GitHub repo URL | Client-side validation, before any network call |
| `not-found` | The repo does not exist, or the token cannot see it | GitHub 404 |
| `rate-limited` | GitHub API rate limit exceeded | GitHub 403 + rate-limit headers; carries an optional `retryAfter` |
| `auth-failure` | The configured token is missing, invalid, or lacks scope | GitHub 401, or 403 on a private repo with no/insufficient token |
| `unknown` | Any other failure (network down, GitHub 5xx) | Fallback |

Each error kind carries a human-readable `message`; the UI maps `kind` to a
heading, an explanation, and a recovery action (see §11).

## 6. Page sections

Single route `/import`, top to bottom:

1. **Page header** — page title "Import a GitHub Repository" and a one-line
   description: "Point the coach at a public or private GitHub repo. We import
   its file tree and key files into local storage so you can explore it here."
2. **Import form** — the repo-URL input, the optional ref input, and the Import
   trigger button (see §7, §8). This is the page's resting state.
3. **Private-repo hint** — a small, always-visible note below the form:
   "Importing a private repository? A GitHub token must be configured in the
   project's `.env` file." Plain text — the page never collects a token.
4. **Status / result region** — a single region directly below the form that
   renders, depending on state: nothing (idle), the in-progress state (§9), the
   success result view (§12), or an error state (§11). Only one of these shows
   at a time. It is an `aria-live` region so state changes are announced.

### In-progress state — within section 4

While `importRepository` is running:
- A heading "Importing <owner>/<repo>…" (and the ref when one was given).
- A progress indicator — an indeterminate `Progress` bar or a spinner — making
  it unmistakable that work is underway.
- A short reassurance line: "Fetching the file tree and key files from GitHub.
  This usually takes a few seconds."
- The Import button shows a loading state and is disabled; the URL and ref
  inputs are disabled so the in-flight import cannot be mutated.

### Success result view — within section 4

After a successful import:
- A success heading — "Repository imported" (first import) or "Snapshot
  refreshed" (re-import; `isReimport === true`).
- An identity line: `owner/repo` and the imported `ref` (a `Badge`), with a note
  when `ref` is the `defaultBranch`.
- A summary: `fileCount` ("N files in the tree"), the count of `keyFiles`
  captured, and `importedAt` (human-readable relative or absolute time).
- A short, readable list of `keyFiles` (path + size) — proof the stack-signal
  files (`package.json`, lockfiles, config, README, CI) were captured (PRD FR-2).
- A primary forward action and a secondary "Import another repository" action
  (see §8).

### Error state — within section 4

See §11 — the region renders the matched error kind's heading, explanation, and
recovery action.

## 7. Input fields

On the **import form** (section 2):

| Field | Type | Behaviour |
|---|---|---|
| **Repository URL** | text input (`Input`) | The GitHub repo URL. Accepts the full browser URL (`https://github.com/owner/repo`), with or without scheme, with or without a trailing `.git` or trailing slash. Placeholder: "https://github.com/owner/repo". Required. Parsed client-side to `owner` + `repo`; an unparseable value yields the `invalid-url` error (§11) without a network call. |
| **Branch / tag (optional)** | text input (`Input`) | An optional git ref to import. Placeholder: "Branch or tag (optional) — defaults to the repo's default branch". Empty means "use the default branch". |

- Validation is **client-side and immediate** for URL shape: the Import button
  is disabled while the URL field is empty, and an unparseable URL surfaces the
  `invalid-url` error state on submit. Existence, access, and rate limits can
  only be known from GitHub and surface as post-submit error states (§11).
- The form is a small Client Component; the rest of the page shell is a Server
  Component.

## 8. Primary actions

- **Import** — the primary button. Parses the URL, then calls
  `importRepository`. Disabled while the URL field is empty and while an import
  is in progress. This is the main action.
- **Try again** — shown in the error state; re-submits the current form values
  (keeps the URL and ref the user already typed) so a transient failure
  (rate limit, network) is one click to retry.
- **Import another repository** — shown in the success state; clears the form
  and returns the page to its idle resting state.
- **Forward action from success** — a primary link from the success view to the
  imported repo (e.g. "View imported repository"). The exact destination route
  belongs to a later task; the page spec reserves a primary action slot for it
  and the integrator wires the real target (or hides it if no destination
  exists yet — see §12).

No destructive actions — the page never deletes a snapshot and never writes to
the user's GitHub repository (PRD: import is read-only).

## 9. Loading state

"Loading" on this page is the **import operation in progress** — it is
first-class in-page state, not a route transition:

- On Import submit, the status/result region (section 4) immediately shows the
  **in-progress state** described in §6: a heading naming the repo, an
  indeterminate `Progress` bar (or spinner), and the reassurance line.
- The Import button enters a loading/disabled state; the URL and ref inputs are
  disabled for the duration.
- The in-progress region carries `aria-busy="true"` and lives in the
  `aria-live` region so assistive tech announces that an import started.
- There is **no route-level `loading.tsx`** for `/import` — the page is a form
  and renders instantly. (Contrast with the M2 Catalog, whose `loading.tsx`
  covered a server data fetch on first paint.)
- The progress indicator may be indeterminate; the import is a single
  server round-trip, not a streamed multi-step job in the MVP.

## 10. Empty state

The page's **idle state is its empty state**: before any import, section 4
renders nothing — only the header, the form, and the private-repo hint are
visible. This is the normal resting state and needs no special "nothing here"
messaging; the form itself is the call to action.

There is no list on this page, so there is no "no results" empty state (unlike
the M2 Catalog). The only emptiness is "no import run yet", which the form
already addresses.

## 11. Error state

Expected import failures are **in-page error states** inside section 4 — not the
route `error.tsx` boundary. Each of the four PRD FR-7 boundary errors gets
distinct, actionable copy; a fifth generic fallback covers the rest:

- **Invalid URL** (`invalid-url`) — heading "That doesn't look like a GitHub
  repository URL". Explanation: the value could not be read as a GitHub repo
  address; show the expected form `https://github.com/owner/repo`. Recovery:
  the URL field is highlighted as invalid; fix it and import again. No network
  call was made.
- **Repository not found** (`not-found`) — heading "Repository not found".
  Explanation: GitHub has no repository at that address, **or** it is private
  and the configured token cannot see it; suggest checking the spelling and, if
  the repo is private, confirming a token with access is configured.
- **Rate limit reached** (`rate-limited`) — heading "GitHub rate limit reached".
  Explanation: too many requests to GitHub for now; if a `retryAfter` is known,
  state when it resets; suggest configuring a GitHub token (authenticated
  requests get a much higher limit) or waiting and retrying. Recovery: a
  "Try again" action.
- **Authentication failed** (`auth-failure`) — heading "GitHub authentication
  failed". Explanation: the GitHub token is missing, invalid, or lacks the scope
  to read this repo; point to configuring `GITHUB_TOKEN` in the project's
  `.env` file (read-only repo scope is enough). The page never collects the
  token inline.
- **Something went wrong** (`unknown`) — heading "Import failed". Explanation: a
  short, friendly catch-all (e.g. GitHub may be unavailable, or the network is
  down); a "Try again" action. No raw stack trace, status code, or API payload
  is shown.

Every error state:
- Renders as text content in the `aria-live` region so it is announced, and
  conveys meaning by text + icon, not color alone.
- Keeps the import form populated with what the user typed, so "Try again"
  (§8) needs no re-entry.
- The route `error.tsx` boundary is reserved for *unexpected render-time*
  failures of the page itself, with a generic "Something went wrong" + reset —
  it is deliberately separate from these import-result error states.

## 12. Success state

- After a successful `importRepository`, section 4 renders the **success result
  view** described in §6: the success heading (first import vs. re-import), the
  `owner/repo` + `ref` identity line, the summary (`fileCount`, key-file count,
  `importedAt`), and the readable `keyFiles` list.
- Re-import (`isReimport === true`, detected via `getImportedRepo`) is shown
  with distinct copy — "Snapshot refreshed" — so the user knows an existing
  snapshot was updated rather than a new repo added (PRD US-3).
- The success view offers the primary forward action and the "Import another
  repository" action (§8). If no forward destination route exists yet, the
  integrator hides that primary action rather than linking nowhere — the
  success view is still complete without it.
- Success is explicit and persistent (the result view stays until the user
  imports another repo) — unlike the M2 Catalog's implicit "content shown"
  success, here the user just performed an action and needs confirmation it
  worked.

## 13. Accessibility notes

- **Semantics & landmarks.** One `<h1>` per page (the page title); the
  in-progress / success / error headings within section 4 descend in order
  (`<h2>`, `<h3>`) with no skipped levels. Use `<main>`, `<nav>`, and
  `<section>` landmarks. The `keyFiles` list in the success view is a `<ul>`.
- **The form.** The Repository URL and Branch/tag inputs each have an associated
  `<label>` (visible or `sr-only`). The optional field is clearly marked
  optional in its label or help text. The URL field exposes its invalid state
  via `aria-invalid` and an `aria-describedby` error message, not color alone.
- **Status region is a live region.** Section 4 is an `aria-live="polite"`
  region; the in-progress state additionally sets `aria-busy="true"`. State
  transitions (import started, succeeded, failed) are announced to assistive
  tech without a focus jump.
- **Loading state.** The progress indicator is decorative; the announced
  information is the in-progress heading text, not the bar itself.
- **States announced.** In-progress, success, and every error message are real
  text content in the document — never color-only or icon-only signals.
- **Keyboard.** Full keyboard operability: Tab reaches the URL input, the ref
  input, the Import button, and (when present) the "Try again", "Import another
  repository", and forward-action controls; Enter/Space activate; submitting the
  form with Enter from the URL field triggers Import. Logical DOM order = visual
  order. Visible focus ring on every control.
- **Disabled controls.** While an import is in progress the disabled Import
  button and inputs are conveyed accessibly (`disabled` / `aria-disabled`), and
  the in-progress announcement explains why interaction is paused.
- **Color & contrast.** Meets WCAG 2.1 AA contrast in light and dark themes (the
  app uses `next-themes`). The success badge and error states use text + icon,
  not color alone.
- **Targets.** Interactive targets (inputs, buttons, links) are comfortably
  sized for pointer and touch.

## 14. Acceptance criteria

- [ ] `/import` renders an import form with a **repository URL** input and an
      **optional branch/tag** input, plus an **Import** trigger button.
- [ ] The URL input accepts a full GitHub URL (`https://github.com/owner/repo`)
      and is parsed to `owner` + `repo`; an unparseable value yields the
      `invalid-url` error state with no network call.
- [ ] Submitting Import shows a first-class **in-progress state** — a heading
      naming the repo, an indeterminate progress indicator, a reassurance line —
      with the button and inputs disabled while it runs.
- [ ] A successful import shows a **success result view**: success/refresh
      heading, `owner/repo` + `ref` identity, summary (`fileCount`, key-file
      count, `importedAt`), and the captured `keyFiles` list.
- [ ] Re-importing an already-imported repo is shown with distinct "snapshot
      refreshed" copy (PRD US-3).
- [ ] **Error** state covers all four PRD FR-7 boundary errors — invalid URL,
      repository not found, rate-limited, authentication failure — each with a
      distinct heading, plain-language explanation, and a recovery action, plus
      a generic fallback. No raw stack traces or status codes shown.
- [ ] After an error, the form keeps the user's input so "Try again" needs no
      re-entry.
- [ ] The page reads from the typed data-access layer (`importRepository`,
      `getImportedRepo`) — it renders states and does not implement GitHub
      access itself.
- [ ] The page uses **only** `packages/ui` (shadcn/ui) components.
- [ ] The private-repo hint references the `.env` token; the page never
      collects a token inline.
- [ ] Accessibility notes in §13 are satisfied (single `<h1>`, ordered
      headings, landmarks, labelled inputs, `aria-live` status region,
      keyboard operability, AA contrast).
- [ ] Page spec is human-reviewed before the Claude Design prompt is used
      (Definition of Done, task #41).
