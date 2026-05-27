// Filename slug helper shared by the M10 export renderers (Issue #182 ZIP +
// Issue #183 PDF). Lives in its own file so both exporters can import the
// same implementation — the contract is "the markdown bundle and the PDF use
// the same slugged filename stem so a downloaded pair sorts together in a
// user's Downloads folder".
//
// The renderer functions in `export-markdown.ts` and `export-pdf.ts` both
// emit a filename of the form:
//
//     portfolio-<slug(owner)>-<slug(repo)>-<snapshot.id>.<ext>
//
// `slug()` lowercases and replaces `/`, whitespace, and any
// filesystem-unsafe char with `-` so the filename is safe on Windows
// (no `< > : " / \ | ? *`), macOS, and Linux (PRD US-6).
//
// Pure string transform — no I/O, no clock, no randomness — so the
// rendered filename is reproducible byte-for-byte across calls (NFR-2).

/**
 * Lowercase + replace `/`, whitespace, and any filesystem-unsafe character
 * with `-`. Collapses runs of `-` and trims leading/trailing separators so
 * the filename is safe on Windows, macOS, and Linux. Falls back to
 * `"portfolio"` when the input slugs to an empty string.
 */
export function slugFilenamePart(value: string): string {
  const lowered = value.toLowerCase()
  // Replace any character outside [a-z0-9._-] (which includes `/`, spaces,
  // and the Windows-reserved set) with `-`.
  const replaced = lowered.replace(/[^a-z0-9._-]+/g, "-")
  // Collapse runs of `-` and trim leading/trailing `-` / `.`.
  const collapsed = replaced.replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "")
  return collapsed.length > 0 ? collapsed : "portfolio"
}

/**
 * Compose the shared `portfolio-<owner>-<repo>-<id>` filename stem (no
 * extension). The ZIP exporter appends `.zip`; the PDF exporter appends
 * `.pdf`. Same slug rule, same component order — same prefix on both
 * downloads.
 */
export function portfolioFilenameStem(
  owner: string,
  repo: string,
  snapshotId: number,
): string {
  return `portfolio-${slugFilenamePart(owner)}-${slugFilenamePart(repo)}-${snapshotId}`
}
