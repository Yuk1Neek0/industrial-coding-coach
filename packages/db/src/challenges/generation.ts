// The bounded Anthropic SDK call that generates a project-tied debug /
// expansion challenge (debug-expansion-challenge PRD FR-1, Issue #142).
//
// `generateChallenge` turns an imported repo snapshot's M6 project map and
// snapshot files into one of the typed M9 challenge models the M9 backend
// caches in the `challenges` table (#140): type, plain-language task
// description, in/out-of-scope file sets strictly limited to M6-named files
// (R8 / FR-3), acceptance criteria, and source references back into the M6
// map.
//
// Per ADR 0005 it is a *bounded* prompt → structured-output call on the
// shared `@workspace/ai` (llm-foundation) client — **not LangChain**, **not
// an autonomous agent**. It is bounded three ways: a fixed two-tool set, a
// hard iteration cap, and a forced structured-output submission on the
// final turn. The model may call `read_snapshot_file` to inspect specific
// M6-mapped files; it returns the result through `submit_challenge`.
//
// Behavior contracts:
//   - **Lazy per challenge type, cached per snapshot** (R2 / FR-1). The
//     first open of a category for a snapshot triggers the SDK call and
//     persists via {@link saveChallenge}; subsequent opens read the cached
//     row without calling the SDK. `forceRegenerate: true` (the "new
//     challenge" UI action) re-invokes the SDK and overwrites the row.
//   - **At least one challenge per applicable type** (R1 / FR-2). The
//     caller picks ONE type per call — the function emits one challenge of
//     that type, or fails with a typed error if the type does not apply
//     (e.g. broken-CI without a real failing CI run, per R6).
//   - **Broken-CI gating** (R6 / FR-2). Inside the type-selection step:
//     emit the broken-CI type only if the caller supplies a real failing CI
//     run via {@link GenerateChallengeInput.failingCiRun}. Until M11
//     surfaces failing runs, that field stays undefined and the type is
//     omitted from the candidate set, not synthesized from a CI config
//     file.
//   - **In/out-of-scope file sets strictly limited to M6-mapped files**
//     (R8 / FR-3). The integrity check from Issue #141 verifies this
//     before persisting; integrity rejection throws a typed
//     {@link ChallengeIntegrityError} — generated outputs are not silently
//     swallowed (FR-6).
//
// Style mirrors `../diff/review.ts` (M8 review call): a discriminated
// {@link GenerateChallengeResult} return on the "expected boundary"
// failures (LLM, no structured output, empty submission), a thrown typed
// error on the "this is a bug" failure (integrity-check rejection). The
// distinction matches the task's contract: integrity is a hard guarantee
// past which a candidate may not be persisted.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient, type LlmClient, type LlmError } from "@workspace/ai"

import type { CatalogDb } from "../client"
import { getImportedRepo, listRepoFiles } from "../github/repos"
import { getProjectMap } from "../mapper/project-maps"
import { createObservedLlmClient, recordEval } from "../observability/record"
import type {
  Challenge,
  ChallengeAcceptanceCriterion,
  ChallengeSourceReference,
  ChallengeType,
  ProjectMap,
  ProjectMapFile,
  RepoSnapshot,
} from "../schema"
import {
  getChallengeBySnapshotAndType,
  saveChallenge,
  type ChallengeContent,
} from "./challenges"
import {
  verifyChallengeIntegrity,
  type CandidateChallenge,
  type IntegrityCheckResult,
} from "./integrity-check"

/**
 * Hard cap on prompt → response round-trips. The model needs turns to read
 * M6-mapped files and one to submit; the cap keeps a misbehaving call
 * bounded (ADR 0005) — the final turn forces the submission tool, so the
 * call always terminates.
 */
const MAX_ITERATIONS = 6

/** Output-token cap — the structured challenge is larger than a chat reply. */
const GENERATE_MAX_TOKENS = 4096

// ---------------------------------------------------------------------------
// Failing CI run — the R6 gating hook
// ---------------------------------------------------------------------------

/**
 * The minimal failing-CI-run shape this call gates the broken-CI type on.
 *
 * R6 normative: the broken-CI challenge type is emitted only if the M11
 * snapshot exposes a real failing CI run / log. When this field is
 * `undefined`, the type is omitted from the candidate set — never
 * synthesized from a CI config file alone. The shape is the contract a
 * future M11 surface will populate; the call only reads what is named here.
 */
export interface FailingCiRun {
  /** A short label identifying the failing run, e.g. `CI / typecheck`. */
  workflowName: string
  /** Optional reason / failure title surfaced by the CI system. */
  conclusion?: string
  /** Optional excerpt from the failing run's log, truncated by the caller. */
  logExcerpt?: string
}

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

/** The distinct failure modes {@link generateChallenge} recognizes. */
export type GenerateChallengeErrorKind =
  /** The snapshot has not been imported. */
  | "snapshot_not_found"
  /** The snapshot has no M6 project map. */
  | "project_map_not_found"
  /** The requested type does not apply to this snapshot (e.g. broken-CI). */
  | "type_not_applicable"
  /** The underlying LLM call failed — carries the mapped {@link LlmError}. */
  | "llm_error"
  /** The model never returned a usable structured challenge. */
  | "no_structured_output"

/** A typed failure from {@link generateChallenge}. */
export class GenerateChallengeError extends Error {
  readonly kind: GenerateChallengeErrorKind
  /** The underlying LLM error, when `kind` is `llm_error`. */
  readonly cause?: LlmError

  constructor(
    kind: GenerateChallengeErrorKind,
    message: string,
    cause?: LlmError,
  ) {
    super(message)
    this.name = "GenerateChallengeError"
    this.kind = kind
    if (cause) this.cause = cause
  }
}

/**
 * Thrown when a generated challenge fails the file-reference integrity
 * check (R8 / FR-6). This is a hard failure — the candidate is **not**
 * persisted, and the caller surfaces the failure rather than silently
 * swallowing a bad output (FR-6).
 *
 * Distinct from {@link GenerateChallengeError} (returned in the discriminated
 * result) because integrity is a contract the generator owes its caller, not
 * an expected boundary failure: a generator that hallucinated an unmapped
 * path is itself buggy.
 */
export class ChallengeIntegrityError extends Error {
  /** The result returned by {@link verifyChallengeIntegrity}. */
  readonly integrity: IntegrityCheckResult
  /** The challenge type whose generation failed integrity. */
  readonly challengeType: ChallengeType
  /** The candidate content that failed — for diagnostics, never persisted. */
  readonly candidate: ChallengeContent

  constructor(
    challengeType: ChallengeType,
    candidate: ChallengeContent,
    integrity: IntegrityCheckResult,
  ) {
    const paths = integrity.unresolved.map((u) => u.path).join(", ")
    super(
      `Generated challenge of type "${challengeType}" referenced ` +
        `file path(s) not named by the M6 project map: ${paths}. ` +
        `R8 forbids adjacent-file inference; the candidate is rejected.`,
    )
    this.name = "ChallengeIntegrityError"
    this.challengeType = challengeType
    this.candidate = candidate
    this.integrity = integrity
  }
}

// ---------------------------------------------------------------------------
// Input / Result
// ---------------------------------------------------------------------------

/** Input for {@link generateChallenge}. */
export interface GenerateChallengeInput {
  /** Repository owner of the imported snapshot. */
  owner: string
  /** Repository name of the imported snapshot. */
  repo: string
  /** Imported ref; omitted → the most recent snapshot for `owner/repo`. */
  ref?: string
  /** The challenge type to generate. */
  type: ChallengeType
  /**
   * A real failing CI run from the M11 snapshot, if any. Required to gate
   * the broken-CI type (R6). Until M11 surfaces failing runs, callers leave
   * this `undefined` and broken-CI is not applicable.
   */
  failingCiRun?: FailingCiRun
  /**
   * LLM client to run the call on. Injectable so tests pass a client built on
   * the `@workspace/ai/testing` mock transport — CI runs with no API key and
   * makes no live calls. Omitted → a real client built from `ANTHROPIC_API_KEY`.
   */
  client?: LlmClient
  /** Catalog DB. Injectable for tests; omitted → the package-local default. */
  db?: CatalogDb
}

/** Options for {@link generateChallenge}. */
export interface GenerateChallengeOptions {
  /**
   * When `true`, re-invoke the SDK and overwrite the cached row — the
   * behavior the "new challenge" UI action (R2 / FR-1) needs. When `false`
   * (default), a cached row is returned without re-calling the SDK.
   */
  forceRegenerate?: boolean
}

/** The successful payload of a generation call. */
export interface GenerateChallengeData {
  /** The persisted challenge row (post-integrity-check, post-save). */
  challenge: Challenge
  /** Whether the SDK was actually invoked, or a cached row was returned. */
  cached: boolean
}

/** The discriminated result of {@link generateChallenge} — never thrown for
 *  boundary failures. Integrity failures throw {@link ChallengeIntegrityError}. */
export type GenerateChallengeResult =
  | { ok: true; data: GenerateChallengeData }
  | { ok: false; error: GenerateChallengeError }

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** Tool the model calls to read one M6-mapped snapshot file's content. */
const READ_FILE_TOOL: Anthropic.Tool = {
  name: "read_snapshot_file",
  description:
    "Read the full text content of one M6-mapped file from the imported " +
    "repository snapshot, by its repo-relative path. Use this to ground " +
    "the challenge in the project's actual code. You may only read paths " +
    "the M6 project map explicitly names — adjacent files (test files, " +
    ".d.ts, index.ts barrels, sibling types) are not available.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Repo-relative path of an M6-mapped file, e.g. apps/web/app/page.tsx.",
      },
    },
    required: ["path"],
  },
}

/** Tool the model calls exactly once to return the structured challenge. */
const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_challenge",
  description:
    "Submit the final, structured challenge. Call this exactly once when " +
    "the challenge is complete. Every path in `inScopeFiles`, " +
    "`outOfScopeFiles`, acceptance criteria, and source references MUST be " +
    "a path the M6 project map explicitly names — no adjacent-file " +
    "inference, even if the file exists in the snapshot.",
  input_schema: {
    type: "object",
    properties: {
      taskDescription: {
        type: "string",
        description:
          "Plain-language description of what the user must do for this " +
          "challenge — concrete and grounded in the M6 map's files.",
      },
      inScopeFiles: {
        type: "array",
        description:
          "Repo-relative M6-mapped paths the user is expected to touch.",
        items: { type: "string" },
      },
      outOfScopeFiles: {
        type: "array",
        description:
          "Repo-relative M6-mapped paths the user must NOT touch. Use real " +
          "nearby M6-mapped files the user might be tempted to change — " +
          "never invent paths.",
        items: { type: "string" },
      },
      acceptanceCriteria: {
        type: "array",
        description:
          "What the user's explanation must cover to pass. Each criterion " +
          "has a stable id (e.g. c1) and plain-language detail.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "Stable identifier, e.g. c1.",
            },
            detail: {
              type: "string",
              description:
                "What 'done' looks like for this criterion, in plain " +
                "language.",
            },
          },
          required: ["id", "detail"],
        },
      },
      sourceReferences: {
        type: "array",
        description:
          "Pointers back into the M6 project map this challenge was " +
          "grounded in — section + M6-mapped path + a plain-language note.",
        items: {
          type: "object",
          properties: {
            section: {
              type: "string",
              enum: [
                "architectureOverview",
                "keyFileMap",
                "requestDataFlow",
                "stateFlow",
                "aiCallFlow",
                "debugPath",
              ],
              description: "Which M6 project-map section this reference is from.",
            },
            path: {
              type: "string",
              description: "The M6-mapped path the reference is grounded in.",
            },
            note: {
              type: "string",
              description:
                "Plain-language note on how this reference grounds the " +
                "challenge.",
            },
          },
          required: ["section", "path", "note"],
        },
      },
    },
    required: [
      "taskDescription",
      "inScopeFiles",
      "outOfScopeFiles",
      "acceptanceCriteria",
      "sourceReferences",
    ],
  },
}

const SYSTEM_PROMPT =
  "You are a coding coach designing a project-tied debug or expansion " +
  "challenge for a job-seeking junior developer. The user built the " +
  "project with heavy AI assistance and must defend it in interviews. " +
  "Your challenge has to be grounded in their actual code — never generic " +
  "advice.\n\n" +
  "You are given the M6 project map of the imported repository (its " +
  "architecture, key files, flows, and debug path) and a " +
  "read_snapshot_file tool for inspecting any M6-mapped file. You are " +
  "given the challenge type to produce.\n\n" +
  "Hard rules:\n" +
  "- Every file path you reference — in-scope, out-of-scope, acceptance " +
  "  criteria, source references — MUST be a path the M6 project map " +
  "  explicitly names. Adjacent-file inference (test files, .d.ts files, " +
  "  index.ts barrels, sibling type files) is FORBIDDEN, even when those " +
  "  files exist in the snapshot.\n" +
  "- Read the M6-mapped files you need to ground the task description and " +
  "  acceptance criteria in real code. Then call submit_challenge exactly " +
  "  once.\n" +
  "- Produce a single challenge of the requested type — small, " +
  "  well-scoped, and explainable. Acceptance criteria should be things " +
  "  the user's explanation can be judged against, not vague qualities."

// ---------------------------------------------------------------------------
// Type-selection / applicability
// ---------------------------------------------------------------------------

/**
 * The challenge types that may always be candidates given a M6 project map.
 * The broken-CI type is excluded here — it is gated on a real failing CI run
 * (R6) and added back in {@link applicableChallengeTypes} only when one is
 * provided.
 */
const ALWAYS_APPLICABLE_TYPES: readonly ChallengeType[] = [
  "add-small-field",
  "trace-failed-api-call",
  "fix-schema-mismatch",
  "add-loading-error-state",
  "add-unit-test",
  "extend-module-safely",
] as const

/**
 * The full set of M9 challenge types that apply to a given snapshot.
 *
 * R1 / FR-2: types that don't apply are skipped (not faked). The only type
 * with a runtime gate is broken-CI (R6) — it is included iff the caller
 * supplies a real {@link FailingCiRun}. Future types may add their own
 * applicability hooks here (e.g. "trace-failed-api-call" requiring an
 * `aiCallFlow` section); the current set assumes every M6 project map names
 * at least one in-scope file for the other six types — the file integrity
 * check is the hard guarantee.
 *
 * Exported so the UI can render exactly the applicable list (R1) without
 * re-invoking the SDK.
 */
export function applicableChallengeTypes(
  projectMap: Pick<ProjectMap, "keyFileMap">,
  failingCiRun?: FailingCiRun,
): ChallengeType[] {
  // Without any M6-mapped files the generator has nothing to ground a
  // challenge in; every type is non-applicable. R8 forbids adjacent-file
  // inference, so a `keyFileMap`-empty map is treated as exhausted.
  if (projectMap.keyFileMap.length === 0) return []
  const types = [...ALWAYS_APPLICABLE_TYPES]
  if (failingCiRun !== undefined) {
    types.push("explain-broken-ci-result")
  }
  return types
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A tool-use content block, narrowed from a response's content. */
type ToolUseBlock = Extract<Anthropic.ContentBlock, { type: "tool_use" }>

/** Collect the tool-use blocks from a response's content. */
function toolUseBlocks(content: Anthropic.ContentBlock[]): ToolUseBlock[] {
  return content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  )
}

/** A non-empty trimmed string, or `null`. */
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

/** A `string[]` of non-empty trimmed strings — anything else dropped. */
function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    const s = str(raw)
    return s ? [s] : []
  })
}

/** Build the initial user prompt: repo identity, project-map context, target type. */
function buildInitialPrompt(
  owner: string,
  repo: string,
  ref: string,
  type: ChallengeType,
  projectMap: ProjectMap,
  failingCiRun?: FailingCiRun,
): string {
  const keyFileLines = projectMap.keyFileMap
    .map((file) => `- ${file.path} — ${file.role}`)
    .join("\n")
  const architectureLines = projectMap.architectureOverview
    .map((section) => `- ${section.title}: ${section.detail}`)
    .join("\n")
  const requestFlowLines = projectMap.requestDataFlow
    .map(
      (step) =>
        `  ${step.order}. ${step.description}` +
        (step.path ? ` (${step.path})` : ""),
    )
    .join("\n")
  const stateFlowLines = projectMap.stateFlow
    .map(
      (step) =>
        `  ${step.order}. ${step.description}` +
        (step.path ? ` (${step.path})` : ""),
    )
    .join("\n")
  const aiCallFlowLines = projectMap.aiCallFlow
    .map(
      (step) =>
        `  ${step.order}. ${step.description}` +
        (step.path ? ` (${step.path})` : ""),
    )
    .join("\n")
  const debugLines = projectMap.debugPath
    .map((step) => `- ${step.location}: ${step.guidance}`)
    .join("\n")

  const ciBlock = failingCiRun
    ? "\n\n## Failing CI run (R6 grounding for broken-CI challenges)\n" +
      `- Workflow: ${failingCiRun.workflowName}\n` +
      (failingCiRun.conclusion
        ? `- Conclusion: ${failingCiRun.conclusion}\n`
        : "") +
      (failingCiRun.logExcerpt
        ? `- Log excerpt:\n\`\`\`\n${failingCiRun.logExcerpt}\n\`\`\`\n`
        : "")
    : ""

  return (
    `Generate a challenge of type "${type}" for the imported repository ` +
    `${owner}/${repo} (ref: ${ref}).\n\n` +
    `## M6 project-map key files (the ONLY paths you may reference)\n` +
    `${keyFileLines || "(none)"}\n\n` +
    `## Architecture overview\n${architectureLines || "(none)"}\n\n` +
    `## Request / data flow\n${requestFlowLines || "(none)"}\n\n` +
    `## State flow\n${stateFlowLines || "(none)"}\n\n` +
    `## AI-call flow\n${aiCallFlowLines || "(none)"}\n\n` +
    `## Debug path\n${debugLines || "(none)"}` +
    `${ciBlock}\n\n` +
    `Read the M6-mapped files you need with read_snapshot_file, then call ` +
    `submit_challenge exactly once. Remember: every path you cite must be ` +
    `in the key-file list above.`
  )
}

/** Resolve a `read_snapshot_file` call to a tool-result content block. */
function readFileResult(
  block: ToolUseBlock,
  fileByPath: Map<string, string>,
  allowed: Set<string>,
): Anthropic.ToolResultBlockParam {
  const input = block.input as { path?: unknown }
  const path = typeof input?.path === "string" ? input.path : ""
  // R8: only M6-mapped paths are readable. An off-map read fails the tool
  // call with a structured error rather than serving a snapshot file —
  // grounding the model in the M6 set, not the raw snapshot.
  if (!allowed.has(path)) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content:
        `Path "${path}" is not in the M6 project map. You may only read ` +
        `paths from the key-file list. Allowed paths: ` +
        `${[...allowed].join(", ")}.`,
    }
  }
  const content = fileByPath.get(path)
  if (content === undefined) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content:
        `No imported file content for M6-mapped path "${path}". The M6 ` +
        `map names this path but the snapshot did not capture its content. ` +
        `Ground the challenge in the file's role from the map instead.`,
    }
  }
  return { type: "tool_result", tool_use_id: block.id, content }
}

/**
 * Validate and coerce a `submit_challenge` tool input into a
 * {@link ChallengeContent}. Returns `null` when the input is not a usable
 * challenge object (so the caller fails with `no_structured_output`).
 * Malformed individual list entries are dropped rather than failing the
 * whole call. Acceptance-criterion ids are de-duplicated.
 */
export function parseChallengeContent(
  input: unknown,
): ChallengeContent | null {
  if (typeof input !== "object" || input === null) return null
  const record = input as Record<string, unknown>

  const taskDescription = str(record.taskDescription)
  if (!taskDescription) return null

  const inScopeFiles = strArray(record.inScopeFiles)
  const outOfScopeFiles = strArray(record.outOfScopeFiles)

  const seenIds = new Set<string>()
  const acceptanceCriteria: ChallengeAcceptanceCriterion[] = Array.isArray(
    record.acceptanceCriteria,
  )
    ? record.acceptanceCriteria.flatMap((raw, index) => {
        if (typeof raw !== "object" || raw === null) return []
        const r = raw as Record<string, unknown>
        const detail = str(r.detail)
        if (!detail) return []
        const rawId = str(r.id)
        let id = rawId ?? `c${index + 1}`
        if (seenIds.has(id)) id = `c${index + 1}`
        if (seenIds.has(id)) id = `c${index + 1}-${seenIds.size}`
        seenIds.add(id)
        return [{ id, detail }]
      })
    : []

  const validSections = new Set<ChallengeSourceReference["section"]>([
    "architectureOverview",
    "keyFileMap",
    "requestDataFlow",
    "stateFlow",
    "aiCallFlow",
    "debugPath",
  ])
  const sourceReferences: ChallengeSourceReference[] = Array.isArray(
    record.sourceReferences,
  )
    ? record.sourceReferences.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return []
        const r = raw as Record<string, unknown>
        const section = str(r.section)
        const path = str(r.path)
        const note = str(r.note)
        if (
          !section ||
          !path ||
          !note ||
          !validSections.has(section as ChallengeSourceReference["section"])
        ) {
          return []
        }
        return [
          {
            section: section as ChallengeSourceReference["section"],
            path,
            note,
          },
        ]
      })
    : []

  // A challenge with no task description, no in-scope files, AND no
  // acceptance criteria is not a usable challenge — the user has nothing
  // to do and nothing the grader can judge against.
  if (
    inScopeFiles.length === 0 &&
    acceptanceCriteria.length === 0
  ) {
    return null
  }

  return {
    taskDescription,
    inScopeFiles,
    outOfScopeFiles,
    acceptanceCriteria,
    sourceReferences,
  }
}

/**
 * Build the {@link CandidateChallenge} the integrity check (#141) expects
 * from a parsed challenge content. The shape is the integrity module's
 * narrow input contract; we flatten in/out-of-scope + acceptance criterion
 * paths into the two arrays it reads.
 */
function toIntegrityCandidate(
  content: ChallengeContent,
): CandidateChallenge {
  return {
    kind: "challenge",
    inScope: content.inScopeFiles,
    outOfScope: content.outOfScopeFiles,
    acceptanceCriteria: content.acceptanceCriteria.map((c) => ({
      id: c.id,
      description: c.detail,
    })),
  }
}

/**
 * Build the {@link CandidateChallenge} that captures source-reference paths
 * too — R8 covers every M9 file reference, not only in/out-of-scope. We run
 * a second integrity pass with the source-reference paths folded into the
 * `inScope` set so the same validator catches them.
 */
function toSourceRefIntegrityCandidate(
  content: ChallengeContent,
): CandidateChallenge {
  return {
    kind: "challenge",
    inScope: content.sourceReferences.map((r) => r.path),
    outOfScope: [],
  }
}

// ---------------------------------------------------------------------------
// The bounded call
// ---------------------------------------------------------------------------

/**
 * Produce one project-tied M9 challenge for an imported repository
 * snapshot, lazily, cached per (snapshot, type), with integrity verified
 * against the M6 project map.
 *
 * The function:
 *   1. Resolves the snapshot via the M11 data-access layer.
 *   2. Loads the M6 project map; the map's `keyFileMap` is the authoritative
 *      file set for R8.
 *   3. Checks applicability — emits `type_not_applicable` for a type the
 *      snapshot does not support (broken-CI without a failing run, per R6).
 *   4. Returns the cached row (R2) unless `forceRegenerate` is true.
 *   5. Runs the bounded tool-use SDK call (ADR 0005).
 *   6. Verifies the candidate against the M6 map via
 *      {@link verifyChallengeIntegrity} (R8 / FR-6).
 *      On failure: throws {@link ChallengeIntegrityError}, persists nothing.
 *   7. Persists via {@link saveChallenge} and returns the stored row.
 *
 * Tool-use loop mirrors the M8 review call (#112). The final allowed turn
 * forces the submission tool, so the call always terminates with structured
 * output or a typed boundary failure.
 */
export async function generateChallenge(
  input: GenerateChallengeInput,
  options?: GenerateChallengeOptions,
): Promise<GenerateChallengeResult> {
  const { owner, repo, ref, type, failingCiRun, db } = input
  const forceRegenerate = options?.forceRegenerate ?? false

  // 1. Resolve snapshot.
  const snapshot: RepoSnapshot | null = await getImportedRepo(
    owner,
    repo,
    ref,
    db,
  )
  if (!snapshot) {
    return {
      ok: false,
      error: new GenerateChallengeError(
        "snapshot_not_found",
        `No imported snapshot for ${owner}/${repo}` +
          `${ref ? `@${ref}` : ""}. Import the repository first.`,
      ),
    }
  }

  // 2. Load M6 project map.
  const projectMap = await getProjectMap(snapshot.id, db)
  if (!projectMap) {
    return {
      ok: false,
      error: new GenerateChallengeError(
        "project_map_not_found",
        `Snapshot ${owner}/${repo}@${snapshot.ref} has no M6 project map. ` +
          `Generate the project map first.`,
      ),
    }
  }

  // 3. Type-selection / applicability — R1 + R6 gating.
  const applicable = applicableChallengeTypes(projectMap, failingCiRun)
  if (!applicable.includes(type)) {
    return {
      ok: false,
      error: new GenerateChallengeError(
        "type_not_applicable",
        `Challenge type "${type}" does not apply to snapshot ` +
          `${owner}/${repo}@${snapshot.ref}` +
          (type === "explain-broken-ci-result"
            ? " — a real failing CI run is required (R6)."
            : "."),
      ),
    }
  }

  // 4. Cache lookup — lazy per type, cached per snapshot (R2).
  if (!forceRegenerate) {
    const cached = await getChallengeBySnapshotAndType(snapshot.id, type, db)
    if (cached) {
      return { ok: true, data: { challenge: cached, cached: true } }
    }
  }

  // 5. Bounded SDK call.
  const allowedPaths = new Set(
    projectMap.keyFileMap.map((file: ProjectMapFile) => file.path),
  )
  const fileByPath = await loadM6FileContents(
    snapshot,
    projectMap.keyFileMap,
    db,
  )

  // Observability (M13): record a trace + integrity eval when a db is
  // available to write to. Best-effort and non-blocking — when `db` is omitted
  // the call runs exactly as before (no wrapping, no trace). The cache-hit
  // path above returns before here, so only real SDK calls are traced.
  const baseClient = input.client ?? createLlmClient()
  const observed = db
    ? createObservedLlmClient(baseClient, {
        traceName: "m9.generate-challenge",
        snapshotId: snapshot.id,
        db,
      })
    : null
  const client = observed ?? baseClient
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: buildInitialPrompt(
        owner,
        repo,
        snapshot.ref,
        type,
        projectMap,
        failingCiRun,
      ),
    },
  ]

  let parsed: ChallengeContent | null = null
  for (let turn = 0; turn < MAX_ITERATIONS; turn += 1) {
    const lastTurn = turn === MAX_ITERATIONS - 1
    const result = await client.complete({
      system: SYSTEM_PROMPT,
      cacheSystem: true,
      messages,
      maxTokens: GENERATE_MAX_TOKENS,
      tools: [READ_FILE_TOOL, SUBMIT_TOOL],
      // On the final turn, force the structured submission so the bounded
      // call always terminates with output rather than another file read.
      toolChoice: lastTurn
        ? { type: "tool", name: SUBMIT_TOOL.name }
        : { type: "auto" },
    })

    if (!result.ok) {
      return {
        ok: false,
        error: new GenerateChallengeError(
          "llm_error",
          `The challenge generation call failed: ${result.error.message}`,
          result.error,
        ),
      }
    }

    const calls = toolUseBlocks(result.data.content)
    const submission = calls.find((c) => c.name === SUBMIT_TOOL.name)
    if (submission) {
      const content = parseChallengeContent(submission.input)
      if (!content) {
        return {
          ok: false,
          error: new GenerateChallengeError(
            "no_structured_output",
            "The model's submitted challenge was empty or malformed.",
          ),
        }
      }
      parsed = content
      break
    }

    const reads = calls.filter((c) => c.name === READ_FILE_TOOL.name)
    if (reads.length === 0) {
      return {
        ok: false,
        error: new GenerateChallengeError(
          "no_structured_output",
          "The model ended its turn without submitting a challenge.",
        ),
      }
    }

    messages.push({ role: "assistant", content: result.data.content })
    messages.push({
      role: "user",
      content: reads.map((block) =>
        readFileResult(block, fileByPath, allowedPaths),
      ),
    })
  }

  if (!parsed) {
    return {
      ok: false,
      error: new GenerateChallengeError(
        "no_structured_output",
        "The challenge generation call did not converge within its turn " +
          "budget.",
      ),
    }
  }

  // 6. Integrity check (R8 / FR-6). Throws ChallengeIntegrityError on
  //    rejection — rejected outputs are NOT silently swallowed (FR-6) and
  //    NOT persisted.
  const integrity = verifyChallengeIntegrity(
    toIntegrityCandidate(parsed),
    projectMap,
  )
  if (!integrity.ok) {
    if (observed) {
      recordEval(
        observed,
        {
          check: "challenge-integrity",
          passed: false,
          reason: `unresolved file references: ${integrity.unresolved
            .map((u) => u.path)
            .join(", ")}`,
        },
        db,
      )
    }
    throw new ChallengeIntegrityError(type, parsed, integrity)
  }
  const sourceRefIntegrity = verifyChallengeIntegrity(
    toSourceRefIntegrityCandidate(parsed),
    projectMap,
  )
  if (!sourceRefIntegrity.ok) {
    if (observed) {
      recordEval(
        observed,
        {
          check: "challenge-integrity",
          passed: false,
          reason: `unresolved source references: ${sourceRefIntegrity.unresolved
            .map((u) => u.path)
            .join(", ")}`,
        },
        db,
      )
    }
    // Re-label the unresolved entries as source-reference origins so the
    // caller's error message points at the right field.
    throw new ChallengeIntegrityError(type, parsed, {
      ok: false,
      unresolved: sourceRefIntegrity.unresolved.map((u) => ({
        ...u,
        origin: "acceptanceCriterion", // closest origin label in the union
      })),
    })
  }

  if (observed) {
    recordEval(observed, { check: "challenge-integrity", passed: true }, db)
  }

  // 7. Persist (R2 cache write).
  const persisted = await saveChallenge(snapshot.id, type, parsed, db)
  return { ok: true, data: { challenge: persisted, cached: false } }
}

/**
 * Load the content of every M6-mapped key file from the snapshot's
 * `repo_files` rows. Files that the M6 map names but the snapshot did not
 * capture content for are absent from the returned map; the read tool
 * surfaces an `is_error` result when the model tries to read them, rather
 * than silently returning empty content.
 */
async function loadM6FileContents(
  snapshot: RepoSnapshot,
  keyFileMap: ProjectMapFile[],
  db?: CatalogDb,
): Promise<Map<string, string>> {
  const files = await listRepoFiles(
    snapshot.owner,
    snapshot.repo,
    snapshot.ref,
    db,
  )
  const named = new Set(keyFileMap.map((file) => file.path))
  const byPath = new Map<string, string>()
  for (const file of files) {
    if (named.has(file.path)) {
      byPath.set(file.path, file.content)
    }
  }
  return byPath
}
