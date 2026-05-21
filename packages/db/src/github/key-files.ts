// Key-file selection for the repo-import module (Issue #39, PRD FR-2, ADR 0009).
//
// "Key files" are the files that carry stack and structure signal — the subset
// M5 (Stack Decision Explainer) / M6 (Project Logic Mapper) need. The import
// module fetches the contents of ONLY these files, never every file, so a
// typical import stays well under GitHub's rate limit (ADR 0009 §2).
//
// Selection is pure: it takes the repository's recursive file tree and returns
// the blob entries that match, tagged with a category. No network here.

import type { TreeEntry } from "./client"

/**
 * The reason a file was selected as a key file. Stored on `repo_files.category`
 * so downstream analysis can branch on file role without re-deriving it.
 */
export type KeyFileCategory =
  /** `package.json` — npm/Node package manifest. */
  | "package-manifest"
  /** A dependency lockfile (pnpm/npm/yarn/bun). */
  | "lockfile"
  /** Framework or build configuration (next.config.*, tsconfig.json, ...). */
  | "build-config"
  /** A README at the repo root or a workspace root. */
  | "readme"
  /** A CI workflow file under `.github/workflows/`. */
  | "ci-workflow"

/** A tree entry chosen for import, paired with why it was chosen. */
export interface SelectedKeyFile {
  /** The matching blob entry from the repository tree. */
  entry: TreeEntry
  /** Why this file is a key file. */
  category: KeyFileCategory
}

/**
 * GitHub's Contents API will not return a body for files past a hard size
 * ceiling (~1 MB) and returns them as `download_url`-only. Key files (manifests,
 * config, READMEs) are small in practice; a file above this limit is skipped
 * rather than risking a contentless fetch. ADR 0009 §2: fetch selectively.
 */
export const MAX_KEY_FILE_BYTES = 512 * 1024

/** Exact base filenames that are always key files, by category. */
const EXACT_NAME_CATEGORIES: ReadonlyMap<string, KeyFileCategory> = new Map([
  ["package.json", "package-manifest"],
  // Lockfiles — one per package manager.
  ["pnpm-lock.yaml", "lockfile"],
  ["package-lock.json", "lockfile"],
  ["yarn.lock", "lockfile"],
  ["npm-shrinkwrap.json", "lockfile"],
  ["bun.lockb", "lockfile"],
  ["bun.lock", "lockfile"],
  // pnpm workspace definition is build/structure config.
  ["pnpm-workspace.yaml", "build-config"],
  ["turbo.json", "build-config"],
  ["tsconfig.json", "build-config"],
  ["jsconfig.json", "build-config"],
  ["vercel.json", "build-config"],
  ["netlify.toml", "build-config"],
  ["dockerfile", "build-config"],
  ["docker-compose.yml", "build-config"],
  ["docker-compose.yaml", "build-config"],
  [".nvmrc", "build-config"],
])

/**
 * Filename patterns for framework/build config whose name varies by extension
 * or suffix — e.g. `next.config.js` / `next.config.mjs` / `next.config.ts`.
 * Tested against the lowercased base filename.
 */
const BUILD_CONFIG_PATTERNS: readonly RegExp[] = [
  // Framework configs: next, vite, astro, nuxt, remix, svelte, gatsby, etc.
  /^(next|vite|vitest|astro|nuxt|remix|svelte|gatsby|angular|webpack|rollup|rspack|tailwind|postcss|babel|drizzle|prisma|tsup|jest|playwright|cypress|eslint|biome|metro|expo|app)\.config\.[cm]?[jt]sx?$/,
  // Drizzle/Prisma config sometimes lives as a bare name with extension.
  /^drizzle\.config\.[cm]?[jt]s$/,
  // tsconfig variants: tsconfig.base.json, tsconfig.build.json, ...
  /^tsconfig\.[\w.-]+\.json$/,
]

/** README at any casing / extension: README, README.md, readme.rst, ... */
const README_PATTERN = /^readme(\.[\w-]+)?$/i

/**
 * Path prefixes whose READMEs are documentation noise, not stack signal — a
 * README under `docs/` or `examples/` describes content, not the project's
 * own stack/structure. READMEs elsewhere (repo root, a workspace package root
 * like `packages/db/`, an app like `apps/web/`) ARE imported.
 */
const README_NOISE_DIRS: readonly string[] = [
  "docs/",
  "doc/",
  "examples/",
  "example/",
  "samples/",
  "sample/",
  "test/",
  "tests/",
  "__tests__/",
  "fixtures/",
  "node_modules/",
  "vendor/",
  "third_party/",
  ".github/",
]

/**
 * Maximum path depth (slash-separated segments) at which a README is still
 * treated as a workspace/package-root README. `apps/web/README.md` and
 * `packages/db/README.md` are depth 3 and kept; deeper is documentation noise.
 */
const README_MAX_DEPTH = 3

/** Return the last `/`-separated segment of a repo-relative path. */
function basename(filePath: string): string {
  const segments = filePath.split("/")
  return segments[segments.length - 1] ?? filePath
}

/**
 * Classify a single tree blob entry as a key file, or `null` when it is not one.
 * Pure and total — exported so it can be unit-tested directly.
 */
export function classifyKeyFile(entry: TreeEntry): KeyFileCategory | null {
  if (entry.type !== "blob") return null

  const path = entry.path
  const name = basename(path).toLowerCase()

  // CI workflow files: any file directly under .github/workflows/.
  if (
    /^\.github\/workflows\/[^/]+\.(ya?ml)$/i.test(path)
  ) {
    return "ci-workflow"
  }

  // Exact-name matches (package.json, lockfiles, tsconfig.json, ...).
  const exact = EXACT_NAME_CATEGORIES.get(name)
  if (exact !== undefined) return exact

  // README — the repo-root README and any workspace/package-root README carry
  // stack/structure signal. Skipped when it is documentation noise: under a
  // docs/examples/tests-style directory, or nested deeper than a typical
  // monorepo package root (e.g. `apps/web/README.md` / `packages/db/README.md`
  // are kept at depth 3; anything deeper is treated as noise).
  if (README_PATTERN.test(name)) {
    const lowerPath = path.toLowerCase()
    const inNoiseDir = README_NOISE_DIRS.some((dir) => lowerPath.includes(dir))
    const tooDeep = path.split("/").length > README_MAX_DEPTH
    return inNoiseDir || tooDeep ? null : "readme"
  }

  // Framework/build config matched by pattern.
  for (const pattern of BUILD_CONFIG_PATTERNS) {
    if (pattern.test(name)) return "build-config"
  }

  return null
}

/**
 * Select every key file from a repository's recursive file tree (PRD FR-2).
 *
 * Returns the matching blob entries tagged with their {@link KeyFileCategory}.
 * Entries larger than {@link MAX_KEY_FILE_BYTES} are excluded — the import
 * module never tries to fetch a file the Contents API would not return a body
 * for. Results preserve the tree's order.
 */
export function selectKeyFiles(tree: TreeEntry[]): SelectedKeyFile[] {
  const selected: SelectedKeyFile[] = []
  for (const entry of tree) {
    const category = classifyKeyFile(entry)
    if (category === null) continue
    // Size is present for blobs; an oversize file is skipped (rate/size-aware).
    if (entry.size !== undefined && entry.size > MAX_KEY_FILE_BYTES) continue
    selected.push({ entry, category })
  }
  return selected
}
