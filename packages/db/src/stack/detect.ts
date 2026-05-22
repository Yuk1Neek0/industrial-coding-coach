// Deterministic stack detection for the M5 Stack Decision Explainer
// (stack-explainer PRD FR-2, Issue #85).
//
// `detectStack` parses an imported snapshot's package and configuration files
// and returns the major tools/frameworks it can recognize. It is a pure,
// deterministic module — no network, no LLM, no database — so the explanation
// call (Issue #86) reasons over a known, reproducible tool set rather than
// guessing the stack. A snapshot whose stack is only partially recognized
// degrades gracefully: an unparseable file is skipped, never thrown on.
//
// `detectStackForSnapshot` is the convenience that reads a snapshot's key files
// through the M11 data-access layer (`listRepoFiles`) and runs `detectStack` —
// no second snapshot-access path.

import { listRepoFiles } from "../github/repos"
import type { CatalogDb } from "../client"
import type { RepoFile } from "../schema"

/** The role a detected tool plays in a project's stack. */
export type ToolCategory =
  | "language"
  | "framework"
  | "ui-library"
  | "styling"
  | "database"
  | "orm"
  | "auth"
  | "state-management"
  | "data-fetching"
  | "validation"
  | "build-tool"
  | "bundler"
  | "package-manager"
  | "monorepo"
  | "testing"
  | "linting"
  | "formatting"
  | "ci"
  | "deployment"
  | "ai-sdk"

/** One tool or framework recognized in an imported snapshot's stack. */
export interface DetectedTool {
  /** Display name, e.g. `Next.js`. */
  name: string
  /** The role this tool plays in the stack. */
  category: ToolCategory
  /**
   * Where the detection came from — a snapshot file path and the signal in it,
   * e.g. `apps/web/package.json (dependency "next")`. Lets the explanation call
   * and a reviewer trace every detected tool back to real evidence.
   */
  evidence: string
}

/** The deterministic result of {@link detectStack}. */
export interface DetectedStack {
  /** The recognized major tools, de-duplicated and stably ordered. */
  tools: DetectedTool[]
  /**
   * Notes on graceful-degradation events — e.g. a `package.json` whose JSON
   * could not be parsed. Empty when every inspected file was understood.
   */
  notes: string[]
}

/** The minimal snapshot-file shape detection needs — a subset of `RepoFile`. */
export type DetectionFile = Pick<RepoFile, "path" | "content">

/** A recognized tool, before it is tied to the evidence that found it. */
interface ToolFact {
  name: string
  category: ToolCategory
}

/**
 * npm package name → the tool it signals. Keyed by exact dependency name as it
 * appears in `package.json`. Covers the JS/TS web stack a job-seeking junior
 * dev's AI-assisted project is overwhelmingly built on.
 */
const PACKAGE_TOOLS: ReadonlyMap<string, ToolFact> = new Map([
  // Language
  ["typescript", { name: "TypeScript", category: "language" }],
  // Frameworks
  ["next", { name: "Next.js", category: "framework" }],
  ["nuxt", { name: "Nuxt", category: "framework" }],
  ["@sveltejs/kit", { name: "SvelteKit", category: "framework" }],
  ["svelte", { name: "Svelte", category: "framework" }],
  ["astro", { name: "Astro", category: "framework" }],
  ["@remix-run/react", { name: "Remix", category: "framework" }],
  ["gatsby", { name: "Gatsby", category: "framework" }],
  ["@angular/core", { name: "Angular", category: "framework" }],
  ["vue", { name: "Vue.js", category: "framework" }],
  ["solid-js", { name: "SolidJS", category: "framework" }],
  ["express", { name: "Express", category: "framework" }],
  ["fastify", { name: "Fastify", category: "framework" }],
  ["@nestjs/core", { name: "NestJS", category: "framework" }],
  ["hono", { name: "Hono", category: "framework" }],
  // UI libraries
  ["react", { name: "React", category: "ui-library" }],
  ["react-dom", { name: "React", category: "ui-library" }],
  ["@mui/material", { name: "Material UI", category: "ui-library" }],
  ["@chakra-ui/react", { name: "Chakra UI", category: "ui-library" }],
  ["antd", { name: "Ant Design", category: "ui-library" }],
  // Styling
  ["tailwindcss", { name: "Tailwind CSS", category: "styling" }],
  ["styled-components", { name: "styled-components", category: "styling" }],
  ["@emotion/react", { name: "Emotion", category: "styling" }],
  ["sass", { name: "Sass", category: "styling" }],
  ["bootstrap", { name: "Bootstrap", category: "styling" }],
  // ORM
  ["drizzle-orm", { name: "Drizzle ORM", category: "orm" }],
  ["@prisma/client", { name: "Prisma", category: "orm" }],
  ["prisma", { name: "Prisma", category: "orm" }],
  ["typeorm", { name: "TypeORM", category: "orm" }],
  ["mongoose", { name: "Mongoose", category: "orm" }],
  ["sequelize", { name: "Sequelize", category: "orm" }],
  ["kysely", { name: "Kysely", category: "orm" }],
  // Database / data services
  ["better-sqlite3", { name: "SQLite", category: "database" }],
  ["pg", { name: "PostgreSQL", category: "database" }],
  ["mysql2", { name: "MySQL", category: "database" }],
  ["mongodb", { name: "MongoDB", category: "database" }],
  ["redis", { name: "Redis", category: "database" }],
  ["ioredis", { name: "Redis", category: "database" }],
  ["@libsql/client", { name: "libSQL / Turso", category: "database" }],
  ["@neondatabase/serverless", { name: "Neon", category: "database" }],
  ["@planetscale/database", { name: "PlanetScale", category: "database" }],
  ["@supabase/supabase-js", { name: "Supabase", category: "database" }],
  ["firebase", { name: "Firebase", category: "database" }],
  // Auth
  ["next-auth", { name: "NextAuth.js", category: "auth" }],
  ["@auth/core", { name: "Auth.js", category: "auth" }],
  ["@clerk/nextjs", { name: "Clerk", category: "auth" }],
  ["lucia", { name: "Lucia", category: "auth" }],
  ["passport", { name: "Passport", category: "auth" }],
  // State management
  ["redux", { name: "Redux", category: "state-management" }],
  ["@reduxjs/toolkit", { name: "Redux Toolkit", category: "state-management" }],
  ["zustand", { name: "Zustand", category: "state-management" }],
  ["jotai", { name: "Jotai", category: "state-management" }],
  ["recoil", { name: "Recoil", category: "state-management" }],
  // Data fetching
  ["@tanstack/react-query", {
    name: "TanStack Query",
    category: "data-fetching",
  }],
  ["swr", { name: "SWR", category: "data-fetching" }],
  ["axios", { name: "Axios", category: "data-fetching" }],
  ["graphql", { name: "GraphQL", category: "data-fetching" }],
  ["@apollo/client", { name: "Apollo Client", category: "data-fetching" }],
  // Validation
  ["zod", { name: "Zod", category: "validation" }],
  ["yup", { name: "Yup", category: "validation" }],
  ["joi", { name: "Joi", category: "validation" }],
  ["valibot", { name: "Valibot", category: "validation" }],
  // Build tools / bundlers / monorepo
  ["vite", { name: "Vite", category: "build-tool" }],
  ["tsup", { name: "tsup", category: "build-tool" }],
  ["@swc/core", { name: "SWC", category: "build-tool" }],
  ["webpack", { name: "webpack", category: "bundler" }],
  ["rollup", { name: "Rollup", category: "bundler" }],
  ["esbuild", { name: "esbuild", category: "bundler" }],
  ["parcel", { name: "Parcel", category: "bundler" }],
  ["turbo", { name: "Turborepo", category: "monorepo" }],
  ["nx", { name: "Nx", category: "monorepo" }],
  // Testing
  ["vitest", { name: "Vitest", category: "testing" }],
  ["jest", { name: "Jest", category: "testing" }],
  ["@playwright/test", { name: "Playwright", category: "testing" }],
  ["cypress", { name: "Cypress", category: "testing" }],
  ["mocha", { name: "Mocha", category: "testing" }],
  ["@testing-library/react", {
    name: "React Testing Library",
    category: "testing",
  }],
  // Linting / formatting
  ["eslint", { name: "ESLint", category: "linting" }],
  ["prettier", { name: "Prettier", category: "formatting" }],
  ["@biomejs/biome", { name: "Biome", category: "linting" }],
  // AI SDKs
  ["@anthropic-ai/sdk", { name: "Anthropic SDK", category: "ai-sdk" }],
  ["openai", { name: "OpenAI SDK", category: "ai-sdk" }],
  ["ai", { name: "Vercel AI SDK", category: "ai-sdk" }],
  ["langchain", { name: "LangChain", category: "ai-sdk" }],
  ["@langchain/core", { name: "LangChain", category: "ai-sdk" }],
  ["@google/generative-ai", {
    name: "Google Generative AI",
    category: "ai-sdk",
  }],
])

/** Scoped-package prefixes whose every member maps to one tool. */
const SCOPE_TOOLS: ReadonlyArray<readonly [string, ToolFact]> = [
  ["@radix-ui/", { name: "Radix UI", category: "ui-library" }],
  ["@trpc/", { name: "tRPC", category: "data-fetching" }],
  ["@aws-sdk/", { name: "AWS SDK", category: "deployment" }],
]

/** Exact config-file basenames (lowercased) → the tool they signal. */
const CONFIG_NAME_TOOLS: ReadonlyMap<string, ToolFact> = new Map([
  ["tsconfig.json", { name: "TypeScript", category: "language" }],
  ["turbo.json", { name: "Turborepo", category: "monorepo" }],
  ["pnpm-workspace.yaml", { name: "pnpm workspaces", category: "monorepo" }],
  ["vercel.json", { name: "Vercel", category: "deployment" }],
  ["netlify.toml", { name: "Netlify", category: "deployment" }],
  ["dockerfile", { name: "Docker", category: "deployment" }],
  ["docker-compose.yml", { name: "Docker", category: "deployment" }],
  ["docker-compose.yaml", { name: "Docker", category: "deployment" }],
  ["biome.json", { name: "Biome", category: "linting" }],
])

/** Config-file basename patterns (lowercased) → the tool they signal. */
const CONFIG_PATTERN_TOOLS: ReadonlyArray<readonly [RegExp, ToolFact]> = [
  [/^next\.config\./, { name: "Next.js", category: "framework" }],
  [/^nuxt\.config\./, { name: "Nuxt", category: "framework" }],
  [/^svelte\.config\./, { name: "Svelte", category: "framework" }],
  [/^astro\.config\./, { name: "Astro", category: "framework" }],
  [/^remix\.config\./, { name: "Remix", category: "framework" }],
  [/^gatsby-config\./, { name: "Gatsby", category: "framework" }],
  [/^vite\.config\./, { name: "Vite", category: "build-tool" }],
  [/^vitest\.config\./, { name: "Vitest", category: "testing" }],
  [/^jest\.config\./, { name: "Jest", category: "testing" }],
  [/^playwright\.config\./, { name: "Playwright", category: "testing" }],
  [/^cypress\.config\./, { name: "Cypress", category: "testing" }],
  [/^tailwind\.config\./, { name: "Tailwind CSS", category: "styling" }],
  [/^postcss\.config\./, { name: "PostCSS", category: "styling" }],
  [/^drizzle\.config\./, { name: "Drizzle ORM", category: "orm" }],
  [/^\.eslintrc/, { name: "ESLint", category: "linting" }],
  [/^eslint\.config\./, { name: "ESLint", category: "linting" }],
  [/^\.prettierrc/, { name: "Prettier", category: "formatting" }],
  [/^prettier\.config\./, { name: "Prettier", category: "formatting" }],
]

/** Lockfile basename → package manager. */
const LOCKFILE_TOOLS: ReadonlyMap<string, ToolFact> = new Map([
  ["pnpm-lock.yaml", { name: "pnpm", category: "package-manager" }],
  ["package-lock.json", { name: "npm", category: "package-manager" }],
  ["yarn.lock", { name: "Yarn", category: "package-manager" }],
  ["bun.lockb", { name: "Bun", category: "package-manager" }],
  ["bun.lock", { name: "Bun", category: "package-manager" }],
])

/** Last `/`-separated segment of a repo-relative path. */
function basename(filePath: string): string {
  const segments = filePath.split("/")
  return segments[segments.length - 1] ?? filePath
}

/**
 * Collect every dependency name across the dependency maps a `package.json`
 * may carry. `peerDependencies` is excluded — it signals what a published
 * package expects of its host, not what this project itself uses.
 */
function dependencyNames(manifest: unknown): string[] {
  if (typeof manifest !== "object" || manifest === null) return []
  const record = manifest as Record<string, unknown>
  const names = new Set<string>()
  for (const field of ["dependencies", "devDependencies"] as const) {
    const map = record[field]
    if (typeof map === "object" && map !== null) {
      for (const name of Object.keys(map)) names.add(name)
    }
  }
  return [...names]
}

/** Map one dependency name onto a {@link ToolFact}, or `null` when unknown. */
function toolForDependency(name: string): ToolFact | null {
  const exact = PACKAGE_TOOLS.get(name)
  if (exact) return exact
  for (const [prefix, fact] of SCOPE_TOOLS) {
    if (name.startsWith(prefix)) return fact
  }
  return null
}

/**
 * Detect the major tools and frameworks of an imported repository snapshot
 * from its package and configuration files (PRD FR-2).
 *
 * Pure and deterministic: the same files always yield the same `tools`, stably
 * ordered by `(category, name)` and de-duplicated by tool name (the first file
 * to evidence a tool wins). Graceful by design — a `package.json` with
 * unparseable JSON is recorded in `notes` and skipped, never thrown on, so a
 * partially recognized stack still returns everything else it found.
 *
 * @param files - the snapshot's key files (`package.json`, lockfiles, build/
 *   framework config, CI workflows). Pass the rows from {@link listRepoFiles}.
 */
export function detectStack(files: DetectionFile[]): DetectedStack {
  /** name → the detected tool kept for it (first evidence wins). */
  const byName = new Map<string, DetectedTool>()
  const notes: string[] = []

  /** Record a tool fact, keeping the first evidence seen for that name. */
  const record = (fact: ToolFact, evidence: string): void => {
    if (!byName.has(fact.name)) {
      byName.set(fact.name, { ...fact, evidence })
    }
  }

  for (const file of files) {
    const name = basename(file.path).toLowerCase()

    // package.json — read every declared dependency.
    if (name === "package.json") {
      let manifest: unknown
      try {
        manifest = JSON.parse(file.content)
      } catch {
        notes.push(`Skipped ${file.path}: its JSON could not be parsed.`)
        continue
      }
      for (const dep of dependencyNames(manifest)) {
        const fact = toolForDependency(dep)
        if (fact) {
          record(fact, `${file.path} (dependency "${dep}")`)
        }
      }
      continue
    }

    // Lockfiles — the package manager in use.
    const lockTool = LOCKFILE_TOOLS.get(name)
    if (lockTool) {
      record(lockTool, file.path)
      continue
    }

    // CI workflow files live under .github/workflows/.
    if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(file.path)) {
      record({ name: "GitHub Actions", category: "ci" }, file.path)
      continue
    }

    // Exact config-file basenames.
    const configTool = CONFIG_NAME_TOOLS.get(name)
    if (configTool) {
      record(configTool, file.path)
      continue
    }

    // Config-file basename patterns (next.config.*, tailwind.config.*, ...).
    for (const [pattern, fact] of CONFIG_PATTERN_TOOLS) {
      if (pattern.test(name)) {
        record(fact, file.path)
        break
      }
    }
  }

  const tools = [...byName.values()].sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  )
  return { tools, notes }
}

/**
 * Detect the stack of an imported repository snapshot, reading its key files
 * through the M11 data-access layer ({@link listRepoFiles}).
 *
 * A convenience over {@link detectStack} — no second snapshot-access path. When
 * the snapshot has no imported files (or does not exist) the result is an empty
 * stack with an explanatory note, never an error.
 */
export async function detectStackForSnapshot(
  owner: string,
  repo: string,
  ref?: string,
  db?: CatalogDb,
): Promise<DetectedStack> {
  const files = await listRepoFiles(owner, repo, ref, db)
  if (files.length === 0) {
    return {
      tools: [],
      notes: [
        `No imported key files found for ${owner}/${repo}` +
          `${ref ? `@${ref}` : ""} — import the repository first.`,
      ],
    }
  }
  return detectStack(files)
}
