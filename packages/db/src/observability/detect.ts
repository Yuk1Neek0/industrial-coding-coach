// Deterministic LLM-app + observability detection (M13 epic llm-observability,
// Issue #221, Part B).
//
// `analyzeObservability` is a PURE analyzer over an imported snapshot's
// `repo_files`. It detects whether a repo is an LLM application and, if so,
// reconstructs a typed **observability story**: which AI SDKs are wired up,
// where model calls happen, what prompt assets exist, and any existing
// observability / eval tooling already in place. It mirrors the M12 CCPM graph's
// pure-analyze pattern (`ccpm/graph.ts`, AD-5): no I/O, no network, no LLM call,
// stable ordering, and a discriminated-union result — a populated `llm-app`
// story or a clean `{ kind: "absent" }` state when no LLM signals are found.
//
// This is DETECTION ONLY. The teaching layer that turns "what's there / what's
// missing" into prose is a separate later task (#223) and is NOT built here.
//
// Tolerance is a hard requirement: the snapshot only captures KEY files (plus,
// from M12, `.claude/**`), so detection is best-effort over what's present. Each
// signal category is reported INDEPENDENTLY so the later teaching layer can
// describe gaps. Nothing is assumed present; nothing throws; absence is clean.

import type { RepoFile } from "../schema"

/**
 * The minimal snapshot-file shape detection needs — a structural subset of
 * {@link RepoFile}. Pass the rows from the M11 data-access layer
 * (`listRepoFiles`); `category` is the snapshot's key-file selection reason
 * (e.g. `package-manifest`, `source`) and is carried through to evidence.
 */
export type ObservabilityFile = Pick<RepoFile, "path" | "content" | "category">

/**
 * An AI SDK recognized in the snapshot, with the evidence that found it. The
 * same SDK detected from both a manifest dependency and an import keeps the
 * first evidence seen (manifest is scanned before imports), so a story always
 * traces back to a real signal.
 */
export interface DetectedSdk {
  /** Display name, e.g. `Anthropic SDK`. */
  name: string
  /**
   * Where the detection came from, e.g.
   * `package.json (dependency "@anthropic-ai/sdk")` or
   * `src/chat.ts (import "openai")`.
   */
  evidence: string
}

/**
 * A model-invocation call site found in captured source. Reports the file and
 * the pattern that matched so the teaching layer can point the user at it.
 */
export interface CallSite {
  /** Repo-relative path of the file the call site is in. */
  path: string
  /** A short label for the pattern matched, e.g. `.messages.create`. */
  pattern: string
}

/**
 * A prompt asset found in the snapshot — a `*.prompt` file, or any file under a
 * `prompts/` directory. Signals that prompts are managed as assets.
 */
export interface PromptAsset {
  /** Repo-relative path of the prompt asset. */
  path: string
  /** Why it was recognized, e.g. `*.prompt file` or `prompts/ directory`. */
  reason: string
}

/**
 * An existing observability / eval tooling signal — e.g. a Langfuse dependency,
 * an OpenLLMetry/Traceloop import, or an `evals/` directory. Reported so the
 * teaching layer can say what instrumentation is already there.
 */
export interface ToolingSignal {
  /** Display name of the tooling, e.g. `Langfuse`. */
  name: string
  /** The evidence path + signal, e.g. `package.json (dependency "langfuse")`. */
  evidence: string
}

/** The observability story for a repo detected as an LLM application. */
export interface LlmAppStory {
  kind: "llm-app"
  /** AI SDKs wired up, de-duplicated by name, stably ordered. */
  sdks: DetectedSdk[]
  /** Model-call sites found in captured source, stably ordered. */
  callSites: CallSite[]
  /** Prompt assets found in the snapshot, stably ordered. */
  promptAssets: PromptAsset[]
  /** Existing observability / eval tooling, de-duplicated, stably ordered. */
  existingTooling: ToolingSignal[]
}

/**
 * The clean detection state: no LLM signals found in the snapshot. NOT an error
 * — a non-LLM repo (or one whose LLM code was not captured as a key file) lands
 * here. `searched` surfaces what was looked for, mirroring `NoCcpmWorkflow`.
 */
export interface NoLlmApp {
  kind: "absent"
  /** What was searched for — surfaced to the user in the explainer. */
  searched: string[]
}

/** Either a populated LLM-app story or the absent/clean state. */
export type ObservabilityStory = LlmAppStory | NoLlmApp

// --- Signal catalogs (small, documented constants) -------------------------

/**
 * npm package name → AI SDK display name. Keyed by exact dependency name as it
 * appears in `package.json` AND as the bare module specifier in an `import` /
 * `require`. Covers the LLM SDKs a job-seeking junior dev's AI-assisted project
 * is overwhelmingly built on. Conservative by design — one match is enough to
 * flag the repo as an LLM app.
 */
const AI_SDK_PACKAGES: ReadonlyMap<string, string> = new Map([
  ["@anthropic-ai/sdk", "Anthropic SDK"],
  ["anthropic", "Anthropic SDK"],
  ["openai", "OpenAI SDK"],
  ["@azure/openai", "Azure OpenAI SDK"],
  ["@google/generative-ai", "Google Generative AI"],
  ["@google-cloud/vertexai", "Google Vertex AI"],
  ["cohere-ai", "Cohere SDK"],
  ["cohere", "Cohere SDK"],
  ["@mistralai/mistralai", "Mistral SDK"],
  ["ai", "Vercel AI SDK"],
  ["langchain", "LangChain"],
  ["@langchain/core", "LangChain"],
  ["llamaindex", "LlamaIndex"],
])

/**
 * Scoped-package prefixes whose every member maps to one SDK. Keeps the exact
 * map small while still catching `@mistralai/*` and `@langchain/*` sub-packages.
 */
const AI_SDK_SCOPES: ReadonlyArray<readonly [string, string]> = [
  ["@mistralai/", "Mistral SDK"],
  ["@langchain/", "LangChain"],
  ["@anthropic-ai/", "Anthropic SDK"],
]

/**
 * Observability / eval tooling: npm package name (manifest dep OR import
 * specifier) → display name. Detection only references these names as string
 * signals — none of them is a dependency of this project (ADR 0009).
 */
const TOOLING_PACKAGES: ReadonlyMap<string, string> = new Map([
  ["langfuse", "Langfuse"],
  ["langfuse-node", "Langfuse"],
  ["langfuse-langchain", "Langfuse"],
  ["@traceloop/node-server-sdk", "OpenLLMetry (Traceloop)"],
  ["@traceloop/instrumentation-openai", "OpenLLMetry (Traceloop)"],
  ["traceloop", "OpenLLMetry (Traceloop)"],
  ["openllmetry", "OpenLLMetry (Traceloop)"],
  ["langsmith", "LangSmith"],
  ["@arizeai/openinference-core", "Arize Phoenix (OpenInference)"],
  ["helicone", "Helicone"],
  ["@helicone/helpers", "Helicone"],
  ["braintrust", "Braintrust"],
  ["promptfoo", "Promptfoo"],
  ["autoevals", "Autoevals"],
])

/** Scoped tooling prefixes whose every member maps to one tool. */
const TOOLING_SCOPES: ReadonlyArray<readonly [string, string]> = [
  ["@traceloop/", "OpenLLMetry (Traceloop)"],
]

/**
 * Model-invocation call-site patterns: a literal substring to scan source for →
 * a short label reported on the {@link CallSite}. Conservative and deterministic
 * — these are the dominant SDK invocation shapes; a match is enough to record a
 * call site (and to flag the repo as an LLM app).
 */
const CALL_SITE_PATTERNS: ReadonlyArray<readonly [string, string]> = [
  [".messages.create", ".messages.create"],
  [".messages.stream", ".messages.stream"],
  [".chat.completions.create", ".chat.completions.create"],
  [".completions.create", ".completions.create"],
  [".responses.create", ".responses.create"],
  [".embeddings.create", ".embeddings.create"],
  ["new Anthropic", "new Anthropic"],
  ["new OpenAI", "new OpenAI"],
  ["generateText(", "generateText() (Vercel AI SDK)"],
  ["streamText(", "streamText() (Vercel AI SDK)"],
  ["generateObject(", "generateObject() (Vercel AI SDK)"],
  ["generateContent(", "generateContent() (Google)"],
]

/** What `analyzeObservability` looks for — surfaced in the absent state. */
const SEARCHED_SIGNALS = [
  "AI SDK dependencies / imports (e.g. @anthropic-ai/sdk, openai, ai)",
  "model-call sites (e.g. .messages.create, .chat.completions.create)",
  "prompt assets (*.prompt files, prompts/ directory)",
  "observability / eval tooling (e.g. langfuse, traceloop, evals/)",
]

// --- Path / manifest helpers -----------------------------------------------

/** Last `/`-separated segment of a repo-relative path. */
function basename(filePath: string): string {
  const segments = filePath.split("/")
  return segments[segments.length - 1] ?? filePath
}

/**
 * Collect every dependency name a `package.json` declares, across the dependency
 * maps. `peerDependencies` is excluded — it signals what a published package
 * expects of its host, not what this project itself uses (matching M5 detect).
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

/** Map a dependency / import specifier onto an SDK name, or `null`. */
function sdkForSpecifier(name: string): string | null {
  const exact = AI_SDK_PACKAGES.get(name)
  if (exact) return exact
  for (const [prefix, sdk] of AI_SDK_SCOPES) {
    if (name.startsWith(prefix)) return sdk
  }
  return null
}

/** Map a dependency / import specifier onto a tooling name, or `null`. */
function toolingForSpecifier(name: string): string | null {
  const exact = TOOLING_PACKAGES.get(name)
  if (exact) return exact
  for (const [prefix, tool] of TOOLING_SCOPES) {
    if (name.startsWith(prefix)) return tool
  }
  return null
}

/**
 * Extract bare module specifiers from a source file's `import` / `require` /
 * dynamic-`import()` statements. Returns the package specifier with any
 * deep-import suffix stripped to its package root (`openai/resources` → `openai`,
 * `@langchain/core/prompts` → `@langchain/core`). Best-effort regex scan — never
 * throws; a specifier it cannot classify is simply ignored downstream.
 */
function importSpecifiers(content: string): string[] {
  const specifiers = new Set<string>()
  const patterns = [
    /import\s+[^'"]*from\s*['"]([^'"]+)['"]/g,
    /import\s*['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(content)) !== null) {
      specifiers.add(packageRoot(match[1]!))
    }
  }
  return [...specifiers]
}

/** Reduce a module specifier to its package root (keeps one scope segment). */
function packageRoot(specifier: string): string {
  if (specifier.startsWith(".")) return specifier // relative — not a package
  const parts = specifier.split("/")
  if (specifier.startsWith("@")) return parts.slice(0, 2).join("/")
  return parts[0] ?? specifier
}

/** True for files whose CONTENT we scan for imports / call sites. */
function isScannableSource(path: string): boolean {
  return /\.(?:[mc]?[jt]sx?)$/.test(path)
}

/** Recognize a prompt asset by path; returns its reason, or `null`. */
function promptAssetReason(path: string): string | null {
  if (/\.prompt$/i.test(path)) return "*.prompt file"
  if (/(?:^|\/)prompts\//.test(path)) return "prompts/ directory"
  return null
}

/** Recognize an `evals/` directory by path. */
function isEvalsPath(path: string): boolean {
  return /(?:^|\/)evals?\//.test(path)
}

// --- The analyzer ----------------------------------------------------------

/**
 * Detect whether an imported snapshot is an LLM application and, if so, build
 * its observability story; otherwise return the clean `{ kind: "absent" }` state.
 *
 * Signals are gathered INDEPENDENTLY from three sources and de-duplicated:
 *   1. manifest deps — every `package.json` dependency / devDependency;
 *   2. import statements — bare specifiers in captured `.ts/.js/...` source;
 *   3. path patterns — `*.prompt`, `prompts/`, `evals/`.
 *
 * Conservative flagging: ANY of an AI SDK signal OR a model-call site is enough
 * to return `llm-app`. Tooling and prompt assets alone do NOT flag an LLM app —
 * they describe instrumentation around model calls, so without an SDK or call
 * site there is no LLM app to instrument and the result is `absent` (with those
 * orphan signals omitted, since the story shape only exists for `llm-app`).
 *
 * Pure and deterministic: the same files always yield the same story, stably
 * ordered. Tolerant of partial snapshots — an unparseable `package.json` is
 * skipped, a missing source file is simply not scanned, and nothing throws.
 *
 * @param files - the snapshot's captured files (`{ path, content, category }`).
 *   Pass the rows from `listRepoFiles`. Order does not affect the result.
 */
export function analyzeObservability(
  files: ObservabilityFile[],
): ObservabilityStory {
  /** SDK name → first evidence kept. */
  const sdks = new Map<string, DetectedSdk>()
  /** Tooling name → first evidence kept. */
  const tooling = new Map<string, ToolingSignal>()
  /** `path|pattern` → call site (dedupe repeated patterns in one file). */
  const callSites = new Map<string, CallSite>()
  /** path → prompt asset (a path is one asset regardless of how it matched). */
  const promptAssets = new Map<string, PromptAsset>()

  const recordSdk = (name: string, evidence: string): void => {
    if (!sdks.has(name)) sdks.set(name, { name, evidence })
  }
  const recordTooling = (name: string, evidence: string): void => {
    if (!tooling.has(name)) tooling.set(name, { name, evidence })
  }

  for (const file of files) {
    const { path, content } = file

    // Path-pattern signals (independent of file content).
    const promptReason = promptAssetReason(path)
    if (promptReason !== null && !promptAssets.has(path)) {
      promptAssets.set(path, { path, reason: promptReason })
    }
    if (isEvalsPath(path)) {
      recordTooling("Evals directory", `${path} (evals/ directory)`)
    }

    // Manifest deps — read every package.json's declared dependencies.
    if (basename(path).toLowerCase() === "package.json") {
      let manifest: unknown
      try {
        manifest = JSON.parse(content)
      } catch {
        continue // tolerant: skip an unparseable manifest, never throw
      }
      for (const dep of dependencyNames(manifest)) {
        const sdk = sdkForSpecifier(dep)
        if (sdk) recordSdk(sdk, `${path} (dependency "${dep}")`)
        const tool = toolingForSpecifier(dep)
        if (tool) recordTooling(tool, `${path} (dependency "${dep}")`)
      }
      continue
    }

    // Source files — scan imports and model-call-site patterns.
    if (isScannableSource(path)) {
      for (const spec of importSpecifiers(content)) {
        const sdk = sdkForSpecifier(spec)
        if (sdk) recordSdk(sdk, `${path} (import "${spec}")`)
        const tool = toolingForSpecifier(spec)
        if (tool) recordTooling(tool, `${path} (import "${spec}")`)
      }
      for (const [needle, label] of CALL_SITE_PATTERNS) {
        if (content.includes(needle)) {
          const key = `${path}|${label}`
          if (!callSites.has(key)) callSites.set(key, { path, pattern: label })
        }
      }
    }
  }

  const isLlmApp = sdks.size > 0 || callSites.size > 0
  if (!isLlmApp) {
    return { kind: "absent", searched: SEARCHED_SIGNALS }
  }

  return {
    kind: "llm-app",
    sdks: [...sdks.values()].sort((a, b) => a.name.localeCompare(b.name)),
    callSites: [...callSites.values()].sort(
      (a, b) =>
        a.path.localeCompare(b.path) || a.pattern.localeCompare(b.pattern),
    ),
    promptAssets: [...promptAssets.values()].sort((a, b) =>
      a.path.localeCompare(b.path),
    ),
    existingTooling: [...tooling.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  }
}
