// Pure view helpers for the M17 Snapshot File Viewer (task #268, page spec
// `docs/design/snapshot-file-viewer.page-spec.md` §4a, §6b, §6c).
//
// Everything here is dependency-free, synchronous string/array logic: the
// `?path=` deep-link contract (normalization, first-param-wins, exact lookup
// against the FULL stored tree), the four file-pane states, the top-level
// directory grouping with its render caps, and the small formatters the page
// shares. No I/O — the DAL reads live in `./data.ts`.

import type { RepoFile, RepoTreeEntry } from "@workspace/db"

/* ── URL contract (§4a) ─────────────────────────────────────────────── */

/** Take only the first value of a possibly repeated `?path=` param (§4a). */
export function firstParamValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Light normalization before lookup (§4a): trim whitespace, strip a leading
 * `/` or `./`. Never fuzzy-matches, case-folds, or guesses; an empty result
 * means "no selection" (default state), not an error.
 */
export function normalizePath(raw: string | undefined): string {
  if (!raw) return ""
  let path = raw.trim()
  if (path.startsWith("./")) path = path.slice(2)
  if (path.startsWith("/")) path = path.slice(1)
  return path
}

/** Deep link to the viewer; `path` encoded whole via `encodeURIComponent`. */
export function fileHref(owner: string, repo: string, path?: string): string {
  const base = `/repos/${owner}/${repo}/files`
  return path ? `${base}?path=${encodeURIComponent(path)}` : base
}

/** Outbound GitHub blob URL for a non-captured file (§6c-ii, ADR 0009). */
export function githubBlobUrl(
  htmlUrl: string,
  ref: string,
  path: string,
): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/")
  return `${htmlUrl}/blob/${ref}/${encodedPath}`
}

/* ── File-pane selection (§6c) ──────────────────────────────────────── */

/** The four file-pane states, decided server-side (§6c). */
export type FileSelection =
  | { kind: "none" }
  | { kind: "captured"; entry: RepoTreeEntry; file: RepoFile }
  | { kind: "not-captured"; entry: RepoTreeEntry }
  | { kind: "directory"; path: string }
  | { kind: "unknown"; path: string }

/**
 * Resolve a normalized `?path` against the FULL stored tree (§4a) — never the
 * rendered subset — with exact, case-sensitive matching. "Captured" is defined
 * by `repo_files` row presence, nothing else (§5 honesty fact 2).
 */
export function resolveSelection(
  requestedPath: string,
  tree: RepoTreeEntry[],
  files: RepoFile[],
): FileSelection {
  if (requestedPath === "") return { kind: "none" }
  const entry = tree.find((candidate) => candidate.path === requestedPath)
  if (!entry) return { kind: "unknown", path: requestedPath }
  if (entry.type === "tree") return { kind: "directory", path: requestedPath }
  const file = files.find((candidate) => candidate.path === requestedPath)
  return file ? { kind: "captured", entry, file } : { kind: "not-captured", entry }
}

/** The top-level tree-pane group a selected path belongs to, if any (§6b). */
export function topLevelGroup(selectedPath: string): string | null {
  if (selectedPath === "") return null
  return selectedPath.split("/")[0] ?? null
}

/* ── Tree pane model (§6b) ──────────────────────────────────────────── */

/** Per-group render cap (§6b): a group shows at most this many entries. */
export const GROUP_RENDER_CAP = 500
/** Whole-pane render cap (§6b): root list + all groups combined. */
export const PANE_RENDER_CAP = 5000

/** One rendered blob row in the tree pane. */
export interface TreeRowModel {
  /** Full repo-relative path — the §4a join key for the link. */
  path: string
  /** Text shown in the row: the remaining path inside its group. */
  label: string
  /** Blob size in bytes, when the tree entry carries one. */
  size: number | undefined
  /** `KeyFileCategory` when a `repo_files` row exists for this path. */
  category: string | null
}

/** One top-level directory group (`<details>`), or a summary-only row. */
export interface TreeGroupModel {
  /** Directory name, no trailing slash (e.g. `apps`). */
  name: string
  /** Total blob entries in the group (shown in the summary count). */
  blobCount: number
  /** Rendered rows — first ≤ caps in tree order, path-sorted for display. */
  rows: TreeRowModel[]
  /** Blobs not rendered because of the §6b caps. */
  hiddenCount: number
  /** `false` → the pane cap was hit before this group: summary-only row. */
  listed: boolean
  /** Group containing the selected `?path` renders open on load. */
  open: boolean
}

/** Everything the tree pane renders. */
export interface TreePaneModel {
  /** Root-level files (paths with no `/`), always visible at the top. */
  rootRows: TreeRowModel[]
  rootHiddenCount: number
  groups: TreeGroupModel[]
  /** Total blob entries in the stored tree. */
  totalBlobs: number
  /** Blob rows actually rendered (root list + listed groups). */
  renderedCount: number
  /** `true` → show the "Large tree" banner (§6b). */
  capped: boolean
}

/**
 * Group the FULL stored tree by top-level directory (§6b): root files first,
 * one group per top-level directory, flat path-sorted lists inside — no
 * recursion. Applies the §6b render caps (500/group, 5,000/pane); the caps
 * affect rendering only — selection lookup runs against the full tree.
 */
export function buildTreePane(
  tree: RepoTreeEntry[],
  files: RepoFile[],
  openGroup: string | null,
): TreePaneModel {
  const categoryByPath = new Map(files.map((file) => [file.path, file.category]))

  const toRow = (entry: RepoTreeEntry, label: string): TreeRowModel => ({
    path: entry.path,
    label,
    size: entry.size,
    category: categoryByPath.get(entry.path) ?? null,
  })

  const rootBlobs: RepoTreeEntry[] = []
  const groupOrder: string[] = []
  const groupBlobs = new Map<string, RepoTreeEntry[]>()

  for (const entry of tree) {
    if (entry.type !== "blob") continue
    const slash = entry.path.indexOf("/")
    if (slash === -1) {
      rootBlobs.push(entry)
      continue
    }
    const dir = entry.path.slice(0, slash)
    const list = groupBlobs.get(dir)
    if (list) {
      list.push(entry)
    } else {
      groupBlobs.set(dir, [entry])
      groupOrder.push(dir)
    }
  }

  let totalBlobs = rootBlobs.length
  for (const blobs of groupBlobs.values()) totalBlobs += blobs.length

  let budget = PANE_RENDER_CAP

  const rootRendered = Math.min(rootBlobs.length, budget)
  budget -= rootRendered
  const rootRows = rootBlobs
    .slice(0, rootRendered)
    .map((entry) => toRow(entry, entry.path))

  const groups: TreeGroupModel[] = groupOrder.map((name) => {
    const blobs = groupBlobs.get(name) ?? []
    const open = openGroup === name
    if (budget <= 0) {
      // Pane cap hit: this group renders as a summary-only row (§6b).
      return {
        name,
        blobCount: blobs.length,
        rows: [],
        hiddenCount: blobs.length,
        listed: false,
        open,
      }
    }
    const renderCount = Math.min(blobs.length, GROUP_RENDER_CAP, budget)
    budget -= renderCount
    const rows = blobs
      // First N in tree order…
      .slice(0, renderCount)
      .map((entry) => toRow(entry, entry.path.slice(name.length + 1)))
      // …displayed as a flat, path-sorted list (§6b).
      .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
    return {
      name,
      blobCount: blobs.length,
      rows,
      hiddenCount: blobs.length - renderCount,
      listed: true,
      open,
    }
  })

  return {
    rootRows,
    rootHiddenCount: rootBlobs.length - rootRendered,
    groups,
    totalBlobs,
    renderedCount: PANE_RENDER_CAP - budget,
    capped: totalBlobs > PANE_RENDER_CAP,
  }
}

/* ── Category labels (§5 / §6b) ─────────────────────────────────────── */

/** Badge text per `KeyFileCategory`: short for tree rows, long for the pane. */
const CATEGORY_BADGES: Record<string, { short: string; long: string }> = {
  "package-manifest": { short: "manifest", long: "Package manifest" },
  lockfile: { short: "lockfile", long: "Lockfile" },
  "build-config": { short: "config", long: "Build / framework config" },
  readme: { short: "README", long: "README" },
  "ci-workflow": { short: "CI", long: "CI workflow" },
  "ccpm-prd": { short: "CCPM", long: "CCPM artifact" },
  "ccpm-epic": { short: "CCPM", long: "CCPM artifact" },
  "ccpm-task": { short: "CCPM", long: "CCPM artifact" },
}

/** Plain-language labels for a captured file's category badge (§5). */
export function categoryBadge(category: string): {
  short: string
  long: string
} {
  return CATEGORY_BADGES[category] ?? { short: category, long: category }
}

/* ── Formatters ─────────────────────────────────────────────────────── */

const NUMBER_FORMAT = new Intl.NumberFormat("en-US")
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

/** Thousands-separated count, e.g. `5,000`. */
export function formatCount(value: number): string {
  return NUMBER_FORMAT.format(value)
}

/** Human-readable size, e.g. `4.2 KB` (§6b tree rows). */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb >= 10 ? Math.round(kb) : kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`
}

/** Exact + human size, e.g. `4,213 bytes · 4.2 KB` (§6c-i metadata). */
export function exactAndHumanSize(bytes: number): string {
  return `${NUMBER_FORMAT.format(bytes)} bytes · ${humanSize(bytes)}`
}

/** Short (7-char) form of a git SHA. */
export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}

/** Imported-at date, e.g. `Jun 11, 2026`. */
export function formatDate(date: Date): string {
  return DATE_FORMAT.format(date)
}
