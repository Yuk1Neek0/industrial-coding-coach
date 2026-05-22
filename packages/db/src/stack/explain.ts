// The bounded Anthropic SDK call that produces a stack explanation
// (stack-explainer PRD FR-3, Issue #86).
//
// `explainStack` turns an imported repo snapshot into the structured,
// project-tied explanation the M5 Stack Decision Explainer persists: a stack
// decision map (per-tool purpose, alternatives + trade-offs, job relevance),
// key files to inspect, and debugging entry points.
//
// Per ADR 0005 it is a *bounded* prompt → structured-output call on the
// `@workspace/ai` (llm-foundation) client — not an autonomous agent. It is
// bounded three ways: a fixed two-tool set, a hard iteration cap, and a forced
// structured-output submission on the final turn. The model may call
// `read_snapshot_file` to inspect specific files so every explanation cites
// real code; it returns the result through `submit_stack_explanation`.
//
// The call runs server-side only and never throws for an expected boundary
// failure — it returns a discriminated {@link ExplainStackResult}, mirroring
// the `@workspace/ai` and `../github` error patterns.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient, type LlmClient, type LlmError } from "@workspace/ai"

import type { CatalogDb } from "../client"
import { getImportedRepo, listRepoFiles } from "../github/repos"
import type {
  DebugEntryPoint,
  KeyFilePointer,
  RepoFile,
  StackTool,
} from "../schema"
import { listTemplates } from "../templates"
import { detectStack, type DetectedStack } from "./detect"
import {
  checkFileReferences,
  type FileReferenceCheck,
  type StackExplanationContent,
} from "./explanations"

/**
 * Hard cap on prompt → response round-trips. The model needs one turn to read
 * files and one to submit; the cap keeps a misbehaving call bounded (ADR 0005)
 * — the final turn forces the submission tool, so the call always terminates.
 */
const MAX_ITERATIONS = 5

/** Output-token cap — the structured explanation is larger than a chat reply. */
const EXPLAIN_MAX_TOKENS = 4096

/** Most file-tree paths to list in the prompt — keeps the call bounded. */
const MAX_TREE_PATHS = 300

// --- Error model -----------------------------------------------------------

/** The distinct failure modes {@link explainStack} recognizes. */
export type ExplainStackErrorKind =
  /** The repository has not been imported — there is no snapshot to explain. */
  | "snapshot_not_found"
  /** The underlying LLM call failed — carries the mapped {@link LlmError}. */
  | "llm_error"
  /** The model never returned a usable structured explanation. */
  | "no_structured_output"

/** A typed failure from the stack explanation call. */
export class ExplainStackError extends Error {
  readonly kind: ExplainStackErrorKind
  /** The underlying LLM error, when `kind` is `llm_error`. */
  readonly cause?: LlmError

  constructor(
    kind: ExplainStackErrorKind,
    message: string,
    cause?: LlmError,
  ) {
    super(message)
    this.name = "ExplainStackError"
    this.kind = kind
    if (cause) this.cause = cause
  }
}

/** The successful payload of a stack explanation call. */
export interface ExplainStackData {
  /** The structured explanation, ready to persist via `saveStackExplanation`. */
  content: StackExplanationContent
  /** The deterministic stack detection the explanation was grounded on. */
  detected: DetectedStack
  /** The FR-4 integrity check of the explanation's cited file paths. */
  fileReferences: FileReferenceCheck
}

/** The discriminated result of {@link explainStack} — never thrown. */
export type ExplainStackResult =
  | { ok: true; data: ExplainStackData }
  | { ok: false; error: ExplainStackError }

/** Input for {@link explainStack}. */
export interface ExplainStackInput {
  /** Repository owner of the imported snapshot. */
  owner: string
  /** Repository name of the imported snapshot. */
  repo: string
  /** Imported ref; omitted → the most recent snapshot for `owner/repo`. */
  ref?: string
  /**
   * LLM client to run the call on. Injectable so tests pass a client built on
   * the `@workspace/ai/testing` mock transport — CI runs with no API key and
   * makes no live calls. Omitted → a real client built from `ANTHROPIC_API_KEY`.
   */
  client?: LlmClient
  /** Catalog DB. Injectable for tests; omitted → the package-local default. */
  db?: CatalogDb
}

// --- Tool definitions ------------------------------------------------------

/** Tool the model calls to read one snapshot file's content. */
const READ_FILE_TOOL: Anthropic.Tool = {
  name: "read_snapshot_file",
  description:
    "Read the full text content of one imported key file from the " +
    "repository snapshot, by its repo-relative path. Use this to ground the " +
    "explanation in the project's actual code and configuration.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Repo-relative path, e.g. apps/web/package.json.",
      },
    },
    required: ["path"],
  },
}

/** Tool the model calls exactly once to return the structured explanation. */
const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_stack_explanation",
  description:
    "Submit the final, structured stack explanation. Call this exactly once " +
    "when the explanation is complete. Every file path cited must be a real " +
    "path from the snapshot.",
  input_schema: {
    type: "object",
    properties: {
      tools: {
        type: "array",
        description:
          "One entry per major tool in the stack — the decision map.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Tool/framework name." },
            purpose: {
              type: "string",
              description:
                "What this tool does in THIS project, in plain language, " +
                "referencing its actual usage or files.",
            },
            alternatives: {
              type: "array",
              description:
                "At least one alternative and the concrete trade-off.",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  tradeOff: {
                    type: "string",
                    description:
                      "What would change in this project if the " +
                      "alternative were used instead.",
                  },
                },
                required: ["name", "tradeOff"],
              },
            },
            jobRelevance: {
              type: "string",
              description: "Why this tool matters for the job market.",
            },
          },
          required: ["name", "purpose", "alternatives", "jobRelevance"],
        },
      },
      keyFiles: {
        type: "array",
        description: "Files worth inspecting to understand the project.",
        items: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "A real repo-relative path from the snapshot.",
            },
            reason: { type: "string" },
          },
          required: ["path", "reason"],
        },
      },
      debugEntryPoints: {
        type: "array",
        description: "Where to start debugging common failures.",
        items: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description: "A real path or a named area of the project.",
            },
            guidance: { type: "string" },
          },
          required: ["location", "guidance"],
        },
      },
    },
    required: ["tools", "keyFiles", "debugEntryPoints"],
  },
}

const SYSTEM_PROMPT =
  "You are a coding coach helping a job-seeking junior developer understand " +
  "and defend a project they built with heavy AI assistance. Your job is to " +
  "explain WHY the project uses its technology stack, grounded in its actual " +
  "files — never generic tutorial text.\n\n" +
  "You are given the project's file tree, a deterministic detection of its " +
  "major tools, and a read_snapshot_file tool to inspect specific files. " +
  "Read the files you need (package.json, config, README) to ground every " +
  "claim in real code. Then call submit_stack_explanation exactly once.\n\n" +
  "For each major tool: explain its purpose in THIS project in plain " +
  "language, give at least one alternative with a concrete trade-off, and a " +
  "job-market relevance note. Cite only real file paths from the snapshot. " +
  "If the detected stack is only partially recognized, explain what you can " +
  "rather than inventing tools."

// --- Helpers ---------------------------------------------------------------

/** A tool-use content block, narrowed from a response's content. */
type ToolUseBlock = Extract<Anthropic.ContentBlock, { type: "tool_use" }>

/** Collect the tool-use blocks from a response's content. */
function toolUseBlocks(content: Anthropic.ContentBlock[]): ToolUseBlock[] {
  return content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  )
}

/**
 * Build the M3-template grounding block: where a detected tool's name appears
 * in a template registry entry, surface that entry's authored rationale and
 * alternatives so the call can lean on reviewed facts (PRD FR-5). Optional —
 * an empty string when nothing matches.
 */
async function buildGrounding(
  detected: DetectedStack,
  db?: CatalogDb,
): Promise<string> {
  const templates = await listTemplates(db)
  const toolNames = detected.tools.map((t) => t.name.toLowerCase())
  const lines: string[] = []
  for (const template of templates) {
    const name = template.name.toLowerCase()
    const matches = toolNames.some(
      (tool) => name.includes(tool) || tool.includes(name),
    )
    if (!matches) continue
    const alts = template.alternatives
      .map((a) => `${a.name} (${a.reason})`)
      .join("; ")
    lines.push(
      `- ${template.name}: ${template.whyUsed}` +
        (alts ? ` Alternatives: ${alts}.` : ""),
    )
  }
  if (lines.length === 0) return ""
  return (
    "\n\nReviewed facts from the template registry (use to ground your " +
    "explanation where relevant):\n" +
    lines.join("\n")
  )
}

/** Build the initial user prompt: repo identity, tree, detected stack. */
function buildInitialPrompt(
  owner: string,
  repo: string,
  ref: string,
  treePaths: string[],
  detected: DetectedStack,
  readableFiles: string[],
  grounding: string,
): string {
  const detectedList = detected.tools
    .map((t) => `- ${t.name} (${t.category}) — from ${t.evidence}`)
    .join("\n")
  const partial =
    detected.notes.length > 0
      ? `\n\nDetection notes:\n${detected.notes.map((n) => `- ${n}`).join("\n")}`
      : ""
  const treeBlock =
    treePaths.length >= MAX_TREE_PATHS
      ? `${treePaths.join("\n")}\n…(file tree truncated)`
      : treePaths.join("\n")
  return (
    `Explain the technology stack of the imported repository ` +
    `${owner}/${repo} (ref: ${ref}).\n\n` +
    `Detected major tools:\n${detectedList || "- (none detected)"}` +
    `${partial}\n\n` +
    `Key files you can read with read_snapshot_file:\n` +
    `${readableFiles.map((p) => `- ${p}`).join("\n")}\n\n` +
    `Repository file tree (paths):\n${treeBlock}` +
    `${grounding}\n\n` +
    `Read the files you need, then call submit_stack_explanation.`
  )
}

/** Resolve a `read_snapshot_file` call to a tool-result content block. */
function readFileResult(
  block: ToolUseBlock,
  fileByPath: Map<string, string>,
): Anthropic.ToolResultBlockParam {
  const input = block.input as { path?: unknown }
  const path = typeof input?.path === "string" ? input.path : ""
  const content = fileByPath.get(path)
  if (content === undefined) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content:
        `No imported file at "${path}". Readable files: ` +
        `${[...fileByPath.keys()].join(", ")}.`,
    }
  }
  return { type: "tool_result", tool_use_id: block.id, content }
}

/** A non-empty trimmed string, or `null`. */
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

/**
 * Validate and coerce a `submit_stack_explanation` tool input into a
 * {@link StackExplanationContent}. Returns `null` when the input is not a
 * usable explanation object (so the caller fails with `no_structured_output`).
 * Malformed individual entries are dropped rather than failing the whole call.
 */
export function parseExplanationContent(
  input: unknown,
): StackExplanationContent | null {
  if (typeof input !== "object" || input === null) return null
  const record = input as Record<string, unknown>

  const tools: StackTool[] = Array.isArray(record.tools)
    ? record.tools.flatMap((raw): StackTool[] => {
        if (typeof raw !== "object" || raw === null) return []
        const t = raw as Record<string, unknown>
        const name = str(t.name)
        const purpose = str(t.purpose)
        const jobRelevance = str(t.jobRelevance)
        if (!name || !purpose || !jobRelevance) return []
        const alternatives = Array.isArray(t.alternatives)
          ? t.alternatives.flatMap((rawAlt) => {
              if (typeof rawAlt !== "object" || rawAlt === null) return []
              const a = rawAlt as Record<string, unknown>
              const altName = str(a.name)
              const tradeOff = str(a.tradeOff)
              return altName && tradeOff
                ? [{ name: altName, tradeOff }]
                : []
            })
          : []
        return [{ name, purpose, alternatives, jobRelevance }]
      })
    : []

  const keyFiles: KeyFilePointer[] = Array.isArray(record.keyFiles)
    ? record.keyFiles.flatMap((raw): KeyFilePointer[] => {
        if (typeof raw !== "object" || raw === null) return []
        const k = raw as Record<string, unknown>
        const path = str(k.path)
        const reason = str(k.reason)
        return path && reason ? [{ path, reason }] : []
      })
    : []

  const debugEntryPoints: DebugEntryPoint[] = Array.isArray(
    record.debugEntryPoints,
  )
    ? record.debugEntryPoints.flatMap((raw): DebugEntryPoint[] => {
        if (typeof raw !== "object" || raw === null) return []
        const d = raw as Record<string, unknown>
        const location = str(d.location)
        const guidance = str(d.guidance)
        return location && guidance ? [{ location, guidance }] : []
      })
    : []

  // A submission with no tools at all is not a usable explanation.
  if (tools.length === 0) return null
  return { tools, keyFiles, debugEntryPoints }
}

// --- The bounded call ------------------------------------------------------

/**
 * Produce a structured stack explanation for an imported repository snapshot
 * (PRD FR-3).
 *
 * Reads the snapshot's key files through the M11 data-access layer, runs
 * deterministic detection ({@link detectStack}), then makes a bounded
 * tool-use call on the `@workspace/ai` client: the model may read specific
 * files, and returns the explanation through `submit_stack_explanation`. On
 * the final allowed turn the submission tool is forced, so the call always
 * terminates with structured output or a typed failure.
 *
 * The returned content is verified against the snapshot with
 * {@link checkFileReferences}; the result reports the integrity outcome but
 * does not throw on a bad reference — persisting and surfacing it is the
 * caller's choice.
 */
export async function explainStack(
  input: ExplainStackInput,
): Promise<ExplainStackResult> {
  const { owner, repo, ref, db } = input

  const files: RepoFile[] = await listRepoFiles(owner, repo, ref, db)
  if (files.length === 0) {
    return {
      ok: false,
      error: new ExplainStackError(
        "snapshot_not_found",
        `No imported snapshot with key files for ${owner}/${repo}` +
          `${ref ? `@${ref}` : ""}. Import the repository first.`,
      ),
    }
  }

  const snapshot = await getImportedRepo(owner, repo, ref, db)
  // `files` is non-empty, so its parent snapshot exists.
  const fileTree = snapshot?.fileTree ?? []
  const detected = detectStack(files)
  const grounding = await buildGrounding(detected, db)

  const fileByPath = new Map(files.map((f) => [f.path, f.content]))
  const treePaths = fileTree
    .filter((e) => e.type === "blob")
    .map((e) => e.path)
    .slice(0, MAX_TREE_PATHS)

  const client = input.client ?? createLlmClient()
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: buildInitialPrompt(
        owner,
        repo,
        ref ?? snapshot?.ref ?? "default",
        treePaths,
        detected,
        [...fileByPath.keys()],
        grounding,
      ),
    },
  ]

  for (let turn = 0; turn < MAX_ITERATIONS; turn += 1) {
    const lastTurn = turn === MAX_ITERATIONS - 1
    const result = await client.complete({
      system: SYSTEM_PROMPT,
      cacheSystem: true,
      messages,
      maxTokens: EXPLAIN_MAX_TOKENS,
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
        error: new ExplainStackError(
          "llm_error",
          `The stack explanation call failed: ${result.error.message}`,
          result.error,
        ),
      }
    }

    const calls = toolUseBlocks(result.data.content)
    const submission = calls.find((c) => c.name === SUBMIT_TOOL.name)
    if (submission) {
      const content = parseExplanationContent(submission.input)
      if (!content) {
        return {
          ok: false,
          error: new ExplainStackError(
            "no_structured_output",
            "The model's submitted explanation was empty or malformed.",
          ),
        }
      }
      return {
        ok: true,
        data: {
          content,
          detected,
          fileReferences: checkFileReferences(content, fileTree),
        },
      }
    }

    const reads = calls.filter((c) => c.name === READ_FILE_TOOL.name)
    if (reads.length === 0) {
      // No tool use and no submission — the model stalled.
      return {
        ok: false,
        error: new ExplainStackError(
          "no_structured_output",
          "The model ended its turn without submitting an explanation.",
        ),
      }
    }

    // Feed the requested file contents back and let the model continue.
    messages.push({ role: "assistant", content: result.data.content })
    messages.push({
      role: "user",
      content: reads.map((block) => readFileResult(block, fileByPath)),
    })
  }

  return {
    ok: false,
    error: new ExplainStackError(
      "no_structured_output",
      "The stack explanation call did not converge within its turn budget.",
    ),
  }
}
