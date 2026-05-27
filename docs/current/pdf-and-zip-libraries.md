# M10 export libraries — ZIP + PDF (both locked)

Setup note for the M10 `learning-memory-portfolio-export` epic's two export
formats. Records the **ZIP library decision** locked in by task #182
(markdown bundle exporter) and the **PDF library decision** locked in by
task #183 (PDF exporter).

## ZIP — `fflate@^0.8.3`

- **Where it's used:** `packages/db/src/learning-memories/export-markdown.ts`
  — `renderPortfolioMarkdownBundle()` packs the six rendered markdown
  files into a single downloadable ZIP buffer for the Portfolio Page's
  *Export bundle (.zip)* Server Action (PRD US-6).
- **Why fflate (not jszip / not adm-zip / not native-zip):**
  - **Smaller** — minified bundle is ~12 kB vs. jszip's ~95 kB. The
    backend reads it from `packages/db` so size matters less than
    surface area; we keep it small anyway because the Portfolio Page's
    Server Action depends on `@workspace/db`.
  - **Pure JS, zero dependencies, no native binding** — matches the
    rest of the catalog stack (Drizzle / better-sqlite3 already pull in
    the only native binding we accept; we did not want a second).
  - **Synchronous + buffer-first API** — `fflate.zipSync({ ... })`
    returns a `Uint8Array` we can hand straight to the Server Action's
    `Response` body. Deterministic ordering by construction: we hand
    fflate an in-order object literal whose keys are the file names
    and whose values are `Uint8Array`s of UTF-8 markdown — same input
    → byte-identical output, which is what M10 NFR-2 (reproducibility)
    requires.
  - **Unzip side ships in the same package** — `fflate.unzipSync()` is
    what the M10 markdown-bundle tests use to round-trip the exporter's
    output and assert the six unpacked files match the in-memory
    `files` record byte-for-byte.
- **Install source:** the official `fflate` README on
  <https://github.com/101arrowz/fflate#installation> —
  `pnpm add fflate` is the documented install command. Installed
  scoped to `@workspace/db` via
  `pnpm add fflate --filter @workspace/db`. The lockfile and
  `packages/db/package.json#dependencies` reflect the install.
- **Reproducibility guarantees we lean on:**
  - We never pass any timestamp, `mtime`, or extra metadata option to
    `zipSync` — the library writes a fixed zero-mtime entry per file
    when none is supplied, so two calls on the same `(memory, snapshot)`
    pair return byte-identical buffers (M10 NFR-2).
  - File ordering inside the zip is the order of the file map's keys,
    which we build by writing keys in literal source order (no `Map`,
    no `Set`, no `Object.keys()` on a foreign object).

## PDF — `@react-pdf/renderer@^4.5.1`

- **Where it's used:** `packages/db/src/learning-memories/export-pdf.ts` —
  `renderPortfolioPdf()` returns a single `portfolio.pdf` Buffer
  containing the same content as the markdown bundle's combined
  `portfolio.md` (PRD FR-7). The Server Action that wires the *Export
  PDF* button (#184) hands the buffer straight to a `Response` body.
- **Why @react-pdf/renderer (not pdfkit / not Puppeteer / not headless
  Chromium):**
  - **No headless browser, no extra binary.** Puppeteer and Playwright
    each bring a ~100–200 MB Chromium download and a non-trivial native
    binding lifecycle. M10 is local-first (PRD NFR-3) and the rest of
    the catalog stack only accepts one native binding (`better-sqlite3`);
    a second one for PDF rendering is the wrong shape.
  - **Pure-React rendering surface.** Q&A, résumé bullets, architecture
    explanation, memory tree, and debug stories already have shaped
    React renderers planned for the Portfolio Page (#184). `@react-pdf
    /renderer`'s `<Document>` / `<Page>` / `<Text>` primitives let us
    keep "this content, rendered" as the mental model in both
    containers — server-action HTML on the page, server-action PDF on
    download — without a parallel `pdfkit` imperative-cursor codebase.
  - **Native React 19 peer support.** `@react-pdf/renderer@4.5.1`'s
    declared peer is `react: ^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0`
    (verified via `pnpm view`); installs cleanly against the workspace's
    React 19.2.6 with no `--legacy-peer-deps` and no peer warnings.
  - **Server-side `renderToBuffer`.** The library exposes a
    `renderToBuffer(<Document />)` entry that returns a Node `Buffer`
    directly — same shape as the markdown bundle's `zip: Buffer`, so the
    Server Action plumbing in #184 stays uniform.
- **Alternative considered — `pdfkit`:** straight-Node imperative cursor
  API, no React peer, smaller dep tree. Rejected as the *default* because
  we'd have to invent our own layout-by-cursor primitives for every
  section, with no reuse from the Portfolio Page's React renderers.
  Kept on the shelf as the fallback if `@react-pdf/renderer` ever drops
  React 19 support — the `renderPortfolioPdf` public surface is a single
  function so the swap is one file.
- **Install source:** the official `@react-pdf/renderer` README on
  <https://react-pdf.org> (and its npm page,
  <https://www.npmjs.com/package/@react-pdf/renderer>) — `pnpm add
  @react-pdf/renderer` is the documented install command. Installed
  scoped to `@workspace/db` via `pnpm add @react-pdf/renderer --filter
  @workspace/db`. The lockfile and `packages/db/package.json#dependencies`
  reflect the install; `react` was added as an explicit dependency on
  the same package so the peer is satisfied even if `packages/db` is ever
  consumed standalone outside the workspace.
- **Server-only constraint.** `renderToBuffer` resolves a Node `Buffer`,
  which is unavailable in the browser. `packages/db`'s exports map is
  server-targeted; the PDF exporter must only be imported into a Server
  Action — never an `"use client"` boundary.
- **Reproducibility note (NFR-2 caveat):** `@react-pdf/renderer` writes a
  `/CreationDate` into the PDF header so the byte output of two calls on
  the same `(memory, snapshot)` pair is *not* identical (it differs in
  the metadata timestamp). The functional content stream is reproducible,
  but the byte-identical guarantee from the ZIP exporter does not carry
  over to the PDF exporter. The M10 NFR-2 wording in the PRD asks for
  reproducible *artifacts*, not byte-identical PDFs; the PDF exporter
  satisfies the artifact-level reading.

---

Last updated: 2026-05-27 (Issue #183).
