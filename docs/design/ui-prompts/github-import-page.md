# Claude Design Prompt: GitHub Repository Import page

Issue: #41 · Epic: `github-integration` · Tool: **Claude Design** (ADR 0007)

UI-generation prompt for the Import page. Full contract: the page spec
`docs/design/github-import-page.md` — read that for the complete behaviour.
(Task #41 and the PRD say "v0"; per ADR 0007 the tool is **Claude Design** and
the page-spec → UI-draft hand-off gate is unchanged.)

## How to use this (Claude Design)

1. In Claude Design, **create a project** and **link this repository** so it
   uses the real `packages/ui` (shadcn/ui) components and styling patterns.
2. Optionally attach the page spec `docs/design/github-import-page.md` as
   context.
3. Paste the prompt below. Iterate on the canvas with chat + inline comments.
4. When happy, **export via "Handoff to Claude Code"** (or `.zip` / standalone
   HTML) and return it here.

The output is a **draft**. Integration task **#42** reconciles it with
`apps/web` + `packages/ui` and wires the page to the real repo-import
data-access layer — do not expect Claude Design to produce final wiring; it
produces the interface.

**Stack to target:** Next.js App Router, React Server Components, TypeScript,
Tailwind CSS, shadcn/ui. Light + dark mode. Build with mock/sample data only —
no data fetching, no real GitHub calls.

---

## Prompt — paste into Claude Design

Build a **GitHub Repository Import** page for a learning-coach web app, using
Next.js (App Router), React, TypeScript, Tailwind CSS, and shadcn/ui. It is a
single page at the route `/import`. Light and dark mode. Use only mock sample
data — do not add any data fetching, API calls, or real GitHub requests; the
import action is a mock that resolves to a sample result or a sample error, so
it is trivial to swap for a real server action later.

### Domain

The product is a local-first learning coach that helps a job-seeking junior
developer understand a software project she built with heavy AI assistance.
This page is how she points the coach at her project: she pastes a **GitHub
repository URL**, the product imports the repo's file tree and key files into
local storage, and later milestones coach her on it.

The target user is a beginner. She is not a GitHub-API expert and has never
reasoned about rate limits or token scopes. Copy must be plain, encouraging, and
jargon-free. Errors must **teach, not blame** — every failure says what happened
and what to do next.

Importing is the product's only network step and can take a few seconds, so the
**in-progress state is first-class** — she must never wonder whether the page
froze.

A repository to import has these fields once imported (the mock success result):

- `owner` — string, the GitHub owner/org
- `repo` — string, the repository name
- `ref` — string, the branch or tag that was imported
- `defaultBranch` — string, the repo's default branch
- `fileCount` — number, how many files are in the file tree
- `keyFiles` — array of `{ path, bytes }`, the key files whose contents were
  captured (e.g. `package.json`, lockfiles, framework/build config, `README`,
  CI workflow files)
- `importedAt` — ISO timestamp string, when the snapshot was taken
- `isReimport` — boolean, whether this updated an existing snapshot

### The page — route `/import`

A single-column, readable layout (comfortable max width). From top to bottom:

1. A **page header**: title "Import a GitHub Repository" and a one-line subtitle
   "Point the coach at a public or private GitHub repo. We import its file tree
   and key files into local storage so you can explore it here."
2. An **import form**:
   - A **Repository URL** text input (shadcn `Input`, with a GitHub or link
     icon), placeholder "https://github.com/owner/repo". Required. It accepts a
     full GitHub URL.
   - An optional **Branch / tag** text input (shadcn `Input`), placeholder
     "Branch or tag (optional) — defaults to the repo's default branch".
   - A primary **Import** button (shadcn `Button`). Disabled while the URL field
     is empty and while an import is in progress.
3. A small **private-repo hint** below the form (muted text): "Importing a
   private repository? A GitHub token must be configured in the project's
   `.env` file." Never show a token input — the page never collects a token.
4. A **status / result region** directly below the form. It shows nothing when
   idle, and otherwise shows exactly one of: the in-progress state, the success
   result, or an error state (all described under "States" below).

### States — design all of these

Provide simple toggles or separate preview screens so every state below can be
viewed on the canvas.

- **Idle** — before any import: only the header, form, and private-repo hint are
  visible; the status/result region is empty. This is the resting state and
  needs no "nothing here" message.

- **In progress** — after Import is pressed, the status region shows: a heading
  "Importing owner/repo…" (include the ref when one was given), an
  **indeterminate progress indicator** (shadcn `Progress` in indeterminate
  style, or a spinner), and a reassurance line "Fetching the file tree and key
  files from GitHub. This usually takes a few seconds." The Import button shows
  a loading/disabled state; the URL and ref inputs are disabled.

- **Success** — after a successful import, the status region shows a result
  card: a success heading — "Repository imported" for a first import, or
  "Snapshot refreshed" when `isReimport` is true — then an identity line with
  `owner/repo` and a shadcn `Badge` for the imported `ref` (note when `ref`
  equals `defaultBranch`), a short summary ("`fileCount` files in the tree",
  the number of key files captured, and `importedAt` as a readable time), and a
  readable list of `keyFiles` showing each `path` and its size. Include a
  primary forward action button ("View imported repository") and a secondary
  "Import another repository" button that returns the page to idle.

- **Error — design all four kinds as distinct states**, each with its own
  heading, a plain-language explanation, and a recovery action. No raw stack
  traces, status codes, or API payloads.
  - **Invalid URL** — heading "That doesn't look like a GitHub repository URL".
    Explain the value couldn't be read as a GitHub repo address and show the
    expected form `https://github.com/owner/repo`. Mark the URL input as invalid
    (`aria-invalid`, error text below it).
  - **Repository not found** — heading "Repository not found". Explain GitHub
    has no repo at that address, or it's private and the configured token can't
    see it; suggest checking the spelling and, for a private repo, confirming a
    token with access is configured.
  - **Rate limit reached** — heading "GitHub rate limit reached". Explain too
    many requests to GitHub for now; suggest configuring a GitHub token (for a
    much higher limit) or waiting and retrying. Include a "Try again" button.
  - **Authentication failed** — heading "GitHub authentication failed". Explain
    the GitHub token is missing, invalid, or lacks scope; point to configuring
    `GITHUB_TOKEN` in the project's `.env` file (read-only repo scope is
    enough). Never collect the token inline.
  - Also design a generic **"Import failed"** fallback for any other failure
    (GitHub unavailable, network down) with a short friendly message and a
    "Try again" button.

  In every error state, keep the import form populated with what the user
  typed, so "Try again" needs no re-entry.

### Visual & accessibility requirements

- Clean, modern, content-first design. Generous spacing, readable typography,
  calm and trustworthy — this is a learning tool, not a marketing page.
- Fully responsive: comfortable on mobile and desktop.
- Light and dark mode, using shadcn/Tailwind theme tokens (no hard-coded
  colors).
- Use **lucide-react** icons (e.g. github/link, loader, check-circle,
  alert-triangle, arrow-right).
- Semantic HTML: exactly one `<h1>` per page (the title); the in-progress /
  success / error headings inside the status region descend in order
  (`<h2>`/`<h3>`) with none skipped. Use `<main>` / `<nav>` / `<section>`
  landmarks. The `keyFiles` list is a `<ul>`.
- Both inputs have associated labels (visible or `sr-only`); the branch/tag
  field is clearly marked optional. The URL input conveys its invalid state via
  `aria-invalid` and an `aria-describedby` error message, not color alone.
- The status/result region is an `aria-live="polite"` region; the in-progress
  state additionally sets `aria-busy="true"` so state changes (import started,
  succeeded, failed) are announced without a focus jump.
- Full keyboard operability with a visible focus ring on every control;
  pressing Enter in the URL field submits the form.
- All text meets WCAG AA contrast in both themes; success and error states
  convey meaning by text + icon, not color alone.

### Components to use

shadcn/ui: `Input`, `Button`, `Card` (`CardHeader`, `CardTitle`,
`CardDescription`, `CardContent`), `Badge`, `Progress` (or a `Skeleton`/spinner
for the in-progress indicator), `Alert` (for the error states), `Label`,
`Separator`. lucide-react for icons. Keep components small and composable so
they integrate cleanly into an existing shadcn/ui monorepo — reuse `packages/ui`
rather than duplicating primitives.

---

## Notes for the integrator (task #42)

- The repo already has shadcn/ui in `packages/ui` (`@workspace/ui`) — **reuse
  it**; do not duplicate primitives. `packages/ui` currently ships only
  `button.tsx`; add the other shadcn components used here (`Input`, `Card`,
  `Badge`, `Progress`, `Alert`, `Label`, `Separator`) to `packages/ui`, not to
  `apps/web`.
- Replace the mock import action with the typed repo-import data-access layer:
  `importRepository({ owner, repo, ref? })` on submit and `getImportedRepo` to
  detect a re-import (`isReimport`). The interactive flow is a small Client
  Component island; the page shell stays a Server Component. The exact
  server-action vs. route-handler shape is decided in this task.
- The URL → `owner`/`repo` parsing belongs in the Client Component: parse before
  any call, and surface an unparseable value as the `invalid-url` error state
  with no network round-trip.
- Map the design's error mockups onto the typed import error `kind`s
  (`invalid-url`, `not-found`, `rate-limited`, `auth-failure`, `unknown`) from
  the data-access layer; render the matched kind's heading/explanation/action.
- Keep expected import failures as **in-page error states**; reserve route
  `error.tsx` for unexpected render-time failures only. There is **no**
  route-level `loading.tsx` for `/import` — the page is a form; "loading" is the
  in-page in-progress state.
- Wire the success view's primary forward action to the real "view imported
  repo" destination when it exists, or hide it until then — do not link
  nowhere.
- Verify the result against `docs/design/github-import-page.md` §14 acceptance
  criteria; record integration notes in `docs/design/ui-integration-notes/`.
