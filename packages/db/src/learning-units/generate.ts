// The bounded Anthropic SDK call that generates a seven-part learning unit
// (issue-based-learning-workspace PRD FR-2 / FR-3 / FR-4 / FR-7, Issue #133).
//
// `generateLearningUnit` turns a normalized {@link LearningUnitInput} (Issue
// #132) into a typed seven-part learning unit ready for persistence on the
// `learning_units` row (Issue #131): a restated goal, a related-files list, a
// concepts list, AI-agent execution notes, a review checklist, understanding
// questions, and a minimal challenge stub (`challengeConcept`,
// `challengeType` per R3 / FR-7).
//
// Per ADR 0005 this is a *bounded* prompt -> structured-output call on the
// `@workspace/ai` (llm-foundation) client — NOT LangChain (M6-only) and NOT an
// autonomous agent. It is bounded three ways: a fixed three-tool set, a hard
// iteration cap, and a forced structured-output submission on the final turn.
// The model may call `read_snapshot_file` to inspect a key file's content
// (via the M11 snapshot data-access layer) and `read_project_map_node` to
// inspect an M6 `project_maps` entry, then returns the unit through
// `submit_learning_unit`.
//
// At the generator boundary the call runs the reusable
// {@link verifyLearningUnitIntegrity} check (Issue #135, FR-4): unresolved
// related-file paths reject the unit (`IntegrityError`) rather than silently
// rendering broken links. Ungrounded concepts and abstract checklist items
// are reported but do not fail the unit on their own (mirrors the M6 / M8
// integrity checks).
//
// Graceful degradation per NFR Resilient:
//   - empty issue body -> the restated goal is annotated with
//     "issue body empty" so the unit still ships;
//   - missing M6 project map -> the integrity check runs without it and the
//     prompt records "project map unavailable" rather than failing;
//   - missing snapshot file content -> the read tool returns a typed "file
//     not in snapshot" / "file in tree but content not snapshotted" message
//     rather than throwing; the model can annotate the related-files entry.
//
// The call runs server-side only and never throws for an expected boundary
// failure (other than the FR-4 `IntegrityError` documented in the
// acceptance criteria) — it returns a discriminated {@link GenerateLearningUnitResult}.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient, type LlmClient, type LlmError } from "@workspace/ai"

import type { CatalogDb } from "../client"
import type { LearningUnitInput } from "../github/issues"
import { createObservedLlmClient, recordEval } from "../observability/record"
import type {
  AgentExecutionStep,
  LearningConcept,
  ProjectMap,
  ProjectMapFile,
  RelatedFile,
  RepoTreeEntry,
  ReviewChecklistItem,
  UnderstandingQuestion,
} from "../schema"
import {
  verifyLearningUnitIntegrity,
  type LearningUnitIntegrityResult,
  type UnresolvedRef,
} from "./integrity"
import type { LearningUnitContent } from "./units"

/**
 * Hard cap on prompt -> response round-trips. The model needs turns to read
 * snapshot files and project-map nodes, plus one to submit; the cap keeps a
 * misbehaving call bounded (ADR 0005, NFR Bounded token use) — the final turn
 * forces the submission tool, so the call always terminates.
 */
const MAX_ITERATIONS = 6

/** Output-token cap — the seven-part unit is larger than a chat reply. */
const GENERATE_MAX_TOKENS = 4096

/** Most related-file candidates to list in the seed prompt — keeps it bounded. */
const MAX_SEED_RELATED_FILES = 40

// --- Error model -----------------------------------------------------------

/** The distinct failure modes {@link generateLearningUnit} recognizes. */
export type GenerateLearningUnitErrorKind =
  /** The underlying LLM call failed — carries the mapped {@link LlmError}. */
  | "llm_error"
  /** The model never returned a usable structured unit. */
  | "no_structured_output"
  /** The generated unit failed the FR-4 integrity check at the boundary. */
  | "integrity_failed"

/**
 * A typed failure from {@link generateLearningUnit}. Use the discriminated
 * subclass {@link IntegrityError} when `kind === "integrity_failed"` — it
 * carries the unresolved references.
 */
export class GenerateLearningUnitError extends Error {
  readonly kind: GenerateLearningUnitErrorKind
  /** The underlying LLM error, when `kind` is `llm_error`. */
  readonly cause?: LlmError

  constructor(
    kind: GenerateLearningUnitErrorKind,
    message: string,
    cause?: LlmError,
  ) {
    super(message)
    this.name = "GenerateLearningUnitError"
    this.kind = kind
    if (cause) this.cause = cause
  }
}

/**
 * The dedicated FR-4 failure: the generated unit was rejected at the
 * generator boundary because file references did not resolve to the snapshot.
 * Carries the integrity check's full unresolved list and the content the
 * model returned, so the caller can surface "what went wrong" without
 * silently rendering broken links.
 */
export class IntegrityError extends GenerateLearningUnitError {
  /** The unresolved references reported by the integrity check. */
  readonly unresolved: UnresolvedRef[]
  /** The (rejected) content the model produced — for diagnostics only. */
  readonly content: LearningUnitContent

  constructor(
    message: string,
    unresolved: UnresolvedRef[],
    content: LearningUnitContent,
  ) {
    super("integrity_failed", message)
    this.name = "IntegrityError"
    this.unresolved = unresolved
    this.content = content
  }
}

/** The successful payload of {@link generateLearningUnit}. */
export interface GenerateLearningUnitData {
  /** The generated, integrity-checked unit, ready to persist. */
  content: LearningUnitContent
  /**
   * The full integrity-check outcome — `ok: true` here, but the
   * `unresolved` list may carry informational (non-blocking) entries for
   * ungrounded concepts and abstract checklist items.
   */
  integrity: LearningUnitIntegrityResult
}

/** The discriminated result of {@link generateLearningUnit} — never thrown. */
export type GenerateLearningUnitResult =
  | { ok: true; data: GenerateLearningUnitData }
  | { ok: false; error: GenerateLearningUnitError }

/** Input for {@link generateLearningUnit}. */
export interface GenerateLearningUnitInput {
  /**
   * The normalized issue / CCPM-task shape produced by Issue #132. Both
   * surfaces fold into one input (R1); the unit and the call do not
   * differentiate by source.
   */
  input: LearningUnitInput
  /**
   * The snapshot's full file tree — every blob path the integrity check
   * resolves against, and the set of paths the model may name in
   * `relatedFiles[].path`. Comes from the M11 snapshot DAL
   * (`RepoSnapshot.fileTree`).
   */
  snapshotFileTree: RepoTreeEntry[]
  /**
   * A read function for snapshot file content, used by the
   * `read_snapshot_file` tool. The M11 snapshot DAL only stores the
   * *content* of key files; for non-key paths the function should resolve to
   * `null` and the tool will report "file in tree but content not
   * snapshotted" rather than failing. For a path that is not in the tree at
   * all, the tool reports "file not in snapshot" without calling this
   * function.
   *
   * Returning the file's content (or `null`) — never throwing — is the
   * contract. Errors from the M11 layer should be caught by the caller and
   * surfaced as `null` so the bounded call degrades gracefully.
   */
  readSnapshotFile: (path: string) => Promise<string | null>
  /**
   * The M6 `project_maps` row for the same snapshot, if one exists. When
   * `null` / omitted the unit degrades gracefully: the prompt records
   * "project map unavailable" and the integrity check runs without map-side
   * concept grounding (NFR Resilient).
   */
  projectMap?: ProjectMap | null
  /**
   * LLM client to run the call on. Injectable so tests pass a client built
   * on the `@workspace/ai/testing` mock transport — CI runs with no API key
   * and makes no live calls. Omitted -> a real client built from
   * `ANTHROPIC_API_KEY`.
   */
  client?: LlmClient
  /**
   * Imported snapshot id this unit is generated for. Optional — when provided
   * together with {@link GenerateLearningUnitInput.db}, the bounded call
   * records an M13 observability trace + integrity eval scoped to the snapshot.
   * Omitted → unscoped (or, without `db`, no trace at all).
   */
  snapshotId?: number
  /**
   * Catalog DB for M13 observability writes. Optional and best-effort: when
   * omitted the client is NOT wrapped and the call behaves exactly as before
   * (no trace, no eval). When provided, a failed observability write is
   * swallowed and never changes the call's result.
   */
  db?: CatalogDb
}

// --- Tool definitions ------------------------------------------------------

/** Tool the model calls to read one snapshot file's full content. */
const READ_SNAPSHOT_FILE_TOOL: Anthropic.Tool = {
  name: "read_snapshot_file",
  description:
    "Read the full text content of one file in the imported repository " +
    "snapshot, by its repo-relative path. Use this to ground every " +
    "concept and related-file reason in real code. Returns the content, " +
    "or an explicit message when the path is not in the snapshot or its " +
    "content was not captured at import time.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Repo-relative path of a file in the snapshot, e.g. " +
          "apps/web/app/page.tsx.",
      },
    },
    required: ["path"],
  },
}

/** Tool the model calls to read one M6 project-map node by reference. */
const READ_PROJECT_MAP_NODE_TOOL: Anthropic.Tool = {
  name: "read_project_map_node",
  description:
    "Read one entry from the M6 project map for this snapshot: either a " +
    "key-file role (by repo-relative file path) or an architecture-overview " +
    "section (by section title). Returns 'project map unavailable' when no " +
    "map exists for the snapshot — the unit should degrade gracefully in " +
    "that case.",
  input_schema: {
    type: "object",
    properties: {
      nodeRef: {
        type: "string",
        description:
          "Either a key-file path (e.g. apps/web/app/page.tsx) or an " +
          "architecture-section title (e.g. 'Frontend').",
      },
    },
    required: ["nodeRef"],
  },
}

/** Tool the model calls exactly once to return the structured unit. */
const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_learning_unit",
  description:
    "Submit the final, structured learning unit. Call this exactly once " +
    "when the unit is complete. Every related-file path must be a real " +
    "path in the snapshot, every concept must tie to a related file or a " +
    "project-map node, and every review-checklist item must reference a " +
    "specific file or concept (no generic 'looks good' items).",
  input_schema: {
    type: "object",
    properties: {
      restatedGoal: {
        type: "string",
        description:
          "The issue or task goal restated in plain language, grounded in " +
          "the snapshot. If the issue body is empty, say so explicitly.",
      },
      relatedFiles: {
        type: "array",
        description:
          "Files in the snapshot related to the unit, with the role each " +
          "plays. Each path must exist in the snapshot file tree.",
        items: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "A real repo-relative path in the snapshot.",
            },
            reason: {
              type: "string",
              description: "Why this file is relevant to the issue / task.",
            },
          },
          required: ["path", "reason"],
        },
      },
      concepts: {
        type: "array",
        description:
          "Concepts the unit teaches, grounded in the project. Every " +
          "concept must tie to a related file or a project-map node.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The concept name, e.g. 'route handlers'.",
            },
            explanation: {
              type: "string",
              description:
                "Plain-language explanation of the concept in this " +
                "project's terms, citing a related file or map node.",
            },
          },
          required: ["name", "explanation"],
        },
      },
      agentExecutionNotes: {
        type: "array",
        description:
          "How an AI coding agent should approach the work, step by step.",
        items: {
          type: "object",
          properties: {
            order: {
              type: "integer",
              description: "One-based position of this step in the notes.",
            },
            description: {
              type: "string",
              description:
                "What the agent should do at this step, in plain language.",
            },
          },
          required: ["order", "description"],
        },
      },
      reviewChecklist: {
        type: "array",
        description:
          "Concrete checklist items the user works through. Each item " +
          "must name a specific related file or concept — never a generic " +
          "'looks good' item.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "A stable, unique identifier for the item, e.g. c1.",
            },
            description: {
              type: "string",
              description:
                "What the user should check, naming a specific file or " +
                "concept.",
            },
          },
          required: ["id", "description"],
        },
      },
      questions: {
        type: "array",
        description:
          "Understanding questions the user must answer to demonstrate " +
          "comprehension. The grading call (#134) keys answers by id.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description:
                "A stable, unique identifier for the question, e.g. q1.",
            },
            prompt: {
              type: "string",
              description: "The question text.",
            },
          },
          required: ["id", "prompt"],
        },
      },
      challengeConcept: {
        type: ["string", "null"],
        description:
          "The minimal challenge concept stub — a one-line concept name " +
          "or null when no challenge is appropriate. M9 will land the " +
          "full challenge schema (R3 / FR-7).",
      },
      challengeType: {
        type: ["string", "null"],
        description:
          "The minimal challenge type stub — 'debug' or 'expand' or null " +
          "(R3 / FR-7).",
      },
    },
    required: [
      "restatedGoal",
      "relatedFiles",
      "concepts",
      "agentExecutionNotes",
      "reviewChecklist",
      "questions",
    ],
  },
}

const SYSTEM_PROMPT =
  "You are a coding coach helping a job-seeking junior developer understand " +
  "and defend a GitHub issue (or CCPM task) they built with heavy AI " +
  "assistance. Your job is to produce a seven-part learning unit that ties " +
  "the issue's goal to real files in the imported snapshot — grounded in " +
  "real code, never generic advice.\n\n" +
  "You are given the normalized issue/task input plus tools to inspect the " +
  "snapshot:\n" +
  " - read_snapshot_file(path) reads one key file's content from the " +
  "snapshot (the M11 data-access layer);\n" +
  " - read_project_map_node(nodeRef) reads one entry from the M6 project " +
  "map for the snapshot, when a map exists.\n\n" +
  "Read what you need to ground every related-file reason and concept in " +
  "real code, then call submit_learning_unit exactly once. Cite only paths " +
  "that exist in the snapshot file tree. Every concept must tie to a " +
  "related file or a project-map node. Every review-checklist item must " +
  "name a specific file or concept. If the issue body is empty, say so " +
  "explicitly in the restated goal. If no project map exists, do not " +
  "fabricate one — note 'project map unavailable' and continue. If a " +
  "snapshot file you want to cite is in the tree but its content was not " +
  "captured at import time, annotate the related-files entry rather than " +
  "dropping the reference."

// --- Helpers ---------------------------------------------------------------

/** A tool-use content block, narrowed from a response's content. */
type ToolUseBlock = Extract<Anthropic.ContentBlock, { type: "tool_use" }>

/** Collect the tool-use blocks from a response's content. */
function toolUseBlocks(content: Anthropic.ContentBlock[]): ToolUseBlock[] {
  return content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  )
}

/** Snapshot blob paths as a `Set` for O(1) "is this path in the snapshot?". */
function blobPaths(fileTree: RepoTreeEntry[]): Set<string> {
  return new Set(
    fileTree.filter((entry) => entry.type === "blob").map((entry) => entry.path),
  )
}

/**
 * Seed the prompt's "candidate related files" list from the input. We mention
 * paths the issue/task body explicitly names (so the model has a starting
 * point that does not require a tool read) plus any key-file paths the M6
 * project map already flagged, capped to a bounded prefix.
 */
function seedRelatedFileCandidates(
  input: LearningUnitInput,
  fileTree: RepoTreeEntry[],
  projectMap: ProjectMap | null,
): string[] {
  const candidates = new Set<string>()
  const known = blobPaths(fileTree)

  // (1) Repo-relative paths mentioned in the issue body / title.
  const haystack = `${input.title}\n${input.body}`
  for (const path of known) {
    if (haystack.includes(path)) candidates.add(path)
  }

  // (2) Key-file paths from the M6 map, where the map exists.
  if (projectMap) {
    for (const entry of projectMap.keyFileMap) {
      if (known.has(entry.path)) candidates.add(entry.path)
    }
  }

  return [...candidates].slice(0, MAX_SEED_RELATED_FILES)
}

/** Build the initial user prompt: issue identity, candidate files, map note. */
function buildInitialPrompt(
  input: LearningUnitInput,
  fileTree: RepoTreeEntry[],
  projectMap: ProjectMap | null,
): string {
  const bodyBlock =
    input.body.trim().length > 0
      ? input.body.trim()
      : "(The issue body is empty. Annotate the restated goal accordingly.)"

  const labelBlock =
    input.labels.length > 0 ? input.labels.join(", ") : "(none)"

  const linkedBlock =
    input.linkedPrs.length > 0
      ? input.linkedPrs.map((n) => `#${n}`).join(", ")
      : "(none)"

  const candidates = seedRelatedFileCandidates(input, fileTree, projectMap)
  const candidateBlock =
    candidates.length > 0
      ? candidates.map((path) => `- ${path}`).join("\n")
      : "(none seeded — explore the snapshot via read_snapshot_file)."

  const mapNote = projectMap
    ? `An M6 project map exists for this snapshot (${projectMap.keyFileMap.length} ` +
      `key-file entries, ${projectMap.architectureOverview.length} ` +
      `architecture section(s)). Use read_project_map_node to inspect entries.`
    : "No M6 project map exists for this snapshot — note 'project map " +
      "unavailable' rather than fabricating one."

  return (
    `Produce a seven-part learning unit for this ${input.source}.\n\n` +
    `## Input\n` +
    `- Source: ${input.source}\n` +
    `- Ref: ${input.issueRef}\n` +
    `- Title: ${input.title}\n` +
    `- State: ${input.state}\n` +
    `- Labels: ${labelBlock}\n` +
    `- Linked PRs: ${linkedBlock}\n` +
    `- Body:\n${bodyBlock}\n\n` +
    `## Snapshot\n` +
    `${fileTree.filter((e) => e.type === "blob").length} blob path(s) ` +
    `available in the file tree. Use read_snapshot_file to inspect any.\n\n` +
    `## Candidate related files (start here; read what you need)\n` +
    `${candidateBlock}\n\n` +
    `## Project map\n${mapNote}\n\n` +
    `Read what you need, then call submit_learning_unit.`
  )
}

/** Resolve a `read_snapshot_file` call to a tool-result content block. */
async function readSnapshotFileResult(
  block: ToolUseBlock,
  fileTreeSet: Set<string>,
  readFile: (path: string) => Promise<string | null>,
): Promise<Anthropic.ToolResultBlockParam> {
  const input = block.input as { path?: unknown }
  const path = typeof input?.path === "string" ? input.path : ""

  if (!fileTreeSet.has(path)) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content:
        `No file at "${path}" is in the snapshot file tree. ` +
        `Cite only paths that exist in the snapshot.`,
    }
  }

  let content: string | null
  try {
    content = await readFile(path)
  } catch {
    content = null
  }

  if (content === null) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content:
        `File "${path}" is in the snapshot tree, but its content was not ` +
        `captured at import time (only key files are stored). Annotate the ` +
        `related-files entry with "file not in snapshot" rather than ` +
        `dropping the reference.`,
    }
  }

  return {
    type: "tool_result",
    tool_use_id: block.id,
    content: `File: ${path}\n\n${content}`,
  }
}

/** Resolve a `read_project_map_node` call to a tool-result content block. */
function readProjectMapNodeResult(
  block: ToolUseBlock,
  projectMap: ProjectMap | null,
): Anthropic.ToolResultBlockParam {
  const input = block.input as { nodeRef?: unknown }
  const ref = typeof input?.nodeRef === "string" ? input.nodeRef.trim() : ""

  if (!projectMap) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content:
        "project map unavailable — no M6 project_maps row exists for this " +
        "snapshot. Note 'project map unavailable' in the unit rather than " +
        "fabricating a map.",
    }
  }

  if (ref.length === 0) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content:
        "nodeRef was empty. Pass a key-file path or an architecture-section " +
        "title.",
    }
  }

  const fileMatch: ProjectMapFile | undefined = projectMap.keyFileMap.find(
    (entry) => entry.path === ref,
  )
  if (fileMatch) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content: `Key file: ${fileMatch.path}\nRole: ${fileMatch.role}`,
    }
  }

  const lowered = ref.toLowerCase()
  const sectionMatch = projectMap.architectureOverview.find(
    (section) => section.title.toLowerCase() === lowered,
  )
  if (sectionMatch) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      content:
        `Architecture section: ${sectionMatch.title}\n` +
        `Detail: ${sectionMatch.detail}`,
    }
  }

  const keyFileList = projectMap.keyFileMap
    .map((entry) => entry.path)
    .join(", ")
  const sectionList = projectMap.architectureOverview
    .map((s) => s.title)
    .join(", ")
  return {
    type: "tool_result",
    tool_use_id: block.id,
    is_error: true,
    content:
      `nodeRef "${ref}" matched no key-file path or architecture-section ` +
      `title. Available key files: ${keyFileList || "(none)"}. ` +
      `Available sections: ${sectionList || "(none)"}.`,
  }
}

/** A non-empty trimmed string, or `null`. */
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

/** A finite integer, or a fallback. */
function intOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)
    ? value
    : fallback
}

/**
 * Validate and coerce a `submit_learning_unit` tool input into a
 * {@link LearningUnitContent}. Returns `null` when the input is not a usable
 * unit (so the caller fails with `no_structured_output`). Individually
 * malformed list entries are dropped rather than failing the whole call.
 *
 * Question and checklist ids are de-duplicated: an entry with a blank or
 * already-seen id is given a stable generated id, so the question shape is a
 * clean input contract for the grading call (#134).
 */
export function parseUnitContent(
  input: unknown,
): LearningUnitContent | null {
  if (typeof input !== "object" || input === null) return null
  const record = input as Record<string, unknown>

  const restatedGoal = str(record.restatedGoal)
  if (!restatedGoal) return null

  const relatedFiles: RelatedFile[] = Array.isArray(record.relatedFiles)
    ? record.relatedFiles.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return []
        const r = raw as Record<string, unknown>
        const path = str(r.path)
        const reason = str(r.reason)
        return path && reason ? [{ path, reason }] : []
      })
    : []

  const concepts: LearningConcept[] = Array.isArray(record.concepts)
    ? record.concepts.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return []
        const c = raw as Record<string, unknown>
        const name = str(c.name)
        const explanation = str(c.explanation)
        return name && explanation ? [{ name, explanation }] : []
      })
    : []

  const agentExecutionNotes: AgentExecutionStep[] = Array.isArray(
    record.agentExecutionNotes,
  )
    ? record.agentExecutionNotes.flatMap((raw, index) => {
        if (typeof raw !== "object" || raw === null) return []
        const s = raw as Record<string, unknown>
        const description = str(s.description)
        if (!description) return []
        return [{ order: intOr(s.order, index + 1), description }]
      })
    : []

  const seenChecklistIds = new Set<string>()
  const reviewChecklist: ReviewChecklistItem[] = Array.isArray(
    record.reviewChecklist,
  )
    ? record.reviewChecklist.flatMap((raw, index) => {
        if (typeof raw !== "object" || raw === null) return []
        const c = raw as Record<string, unknown>
        const description = str(c.description)
        if (!description) return []
        const rawId = str(c.id)
        let id = rawId ?? `c${index + 1}`
        if (seenChecklistIds.has(id)) id = `c${index + 1}`
        seenChecklistIds.add(id)
        return [{ id, description }]
      })
    : []

  const seenQuestionIds = new Set<string>()
  const questions: UnderstandingQuestion[] = Array.isArray(record.questions)
    ? record.questions.flatMap((raw, index) => {
        if (typeof raw !== "object" || raw === null) return []
        const q = raw as Record<string, unknown>
        const prompt = str(q.prompt)
        if (!prompt) return []
        const rawId = str(q.id)
        let id = rawId ?? `q${index + 1}`
        if (seenQuestionIds.has(id)) id = `q${index + 1}`
        seenQuestionIds.add(id)
        return [{ id, prompt }]
      })
    : []

  // A unit with no related files AND no questions is not a usable unit — the
  // primary FR-2 fields would be entirely empty.
  if (relatedFiles.length === 0 && questions.length === 0) {
    return null
  }

  const challengeConcept = str(record.challengeConcept)
  const challengeType = str(record.challengeType)

  return {
    restatedGoal,
    relatedFiles,
    concepts,
    agentExecutionNotes,
    reviewChecklist,
    questions,
    challengeConcept,
    challengeType,
  }
}

// --- The bounded call ------------------------------------------------------

/**
 * Produce a typed seven-part learning unit for one normalized issue/task input
 * (PRD FR-2 / FR-3 / FR-4 / FR-7).
 *
 * Makes a bounded tool-use call on the `@workspace/ai` client: the model may
 * inspect snapshot files through `read_snapshot_file` and project-map entries
 * through `read_project_map_node`, then returns the unit through
 * `submit_learning_unit`. On the final allowed turn the submission tool is
 * forced, so the call always terminates with structured output or a typed
 * failure.
 *
 * The returned content is verified against the snapshot file tree (and the
 * project map, when supplied) with {@link verifyLearningUnitIntegrity}. If
 * the unit has any unresolved related-file path the result rejects with an
 * {@link IntegrityError} carrying the full unresolved list — FR-4's
 * "fail rather than silently render broken links" requirement. Informational
 * findings (ungrounded concepts, abstract checklist items) are surfaced on
 * the successful result's `integrity.unresolved` but do not reject the unit.
 */
export async function generateLearningUnit(
  input: GenerateLearningUnitInput,
): Promise<GenerateLearningUnitResult> {
  const projectMap = input.projectMap ?? null
  const fileTreeSet = blobPaths(input.snapshotFileTree)

  // Observability (M13): wrap the client to record a trace + integrity eval
  // when a db is available. Best-effort and non-blocking — when `db` is omitted
  // the call runs exactly as before (no wrapping, no trace).
  const baseClient = input.client ?? createLlmClient()
  const observed = input.db
    ? createObservedLlmClient(baseClient, {
        traceName: "m7.generate-unit",
        snapshotId: input.snapshotId,
        db: input.db,
      })
    : null
  const client = observed ?? baseClient
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: buildInitialPrompt(input.input, input.snapshotFileTree, projectMap),
    },
  ]

  for (let turn = 0; turn < MAX_ITERATIONS; turn += 1) {
    const lastTurn = turn === MAX_ITERATIONS - 1
    const result = await client.complete({
      system: SYSTEM_PROMPT,
      cacheSystem: true,
      messages,
      maxTokens: GENERATE_MAX_TOKENS,
      tools: [READ_SNAPSHOT_FILE_TOOL, READ_PROJECT_MAP_NODE_TOOL, SUBMIT_TOOL],
      // On the final turn, force the submission tool so the bounded call
      // always terminates with output rather than another exploratory read.
      toolChoice: lastTurn
        ? { type: "tool", name: SUBMIT_TOOL.name }
        : { type: "auto" },
    })

    if (!result.ok) {
      return {
        ok: false,
        error: new GenerateLearningUnitError(
          "llm_error",
          `The learning-unit generation call failed: ${result.error.message}`,
          result.error,
        ),
      }
    }

    const calls = toolUseBlocks(result.data.content)
    const submission = calls.find((c) => c.name === SUBMIT_TOOL.name)
    if (submission) {
      const content = parseUnitContent(submission.input)
      if (!content) {
        return {
          ok: false,
          error: new GenerateLearningUnitError(
            "no_structured_output",
            "The model's submitted learning unit was empty or malformed.",
          ),
        }
      }
      const integrity = verifyLearningUnitIntegrity(
        content,
        fileTreeSet,
        projectMap ?? undefined,
      )
      if (!integrity.ok) {
        const missing = integrity.unresolved
          .filter((u) => u.kind === "related-file")
          .map((u) => u.value)
        if (observed) {
          recordEval(
            observed,
            {
              check: "learning-unit-integrity",
              passed: false,
              reason: `unresolved related-file paths: ${missing.join(", ")}`,
            },
            input.db,
          )
        }
        return {
          ok: false,
          error: new IntegrityError(
            `Generated unit rejected: ${missing.length} related-file ` +
              `path(s) do not resolve to the snapshot ` +
              `(${missing.join(", ")}).`,
            integrity.unresolved,
            content,
          ),
        }
      }
      if (observed) {
        recordEval(
          observed,
          { check: "learning-unit-integrity", passed: true },
          input.db,
        )
      }
      return { ok: true, data: { content, integrity } }
    }

    const reads = calls.filter(
      (c) =>
        c.name === READ_SNAPSHOT_FILE_TOOL.name ||
        c.name === READ_PROJECT_MAP_NODE_TOOL.name,
    )
    if (reads.length === 0) {
      // No tool use and no submission — the model stalled.
      return {
        ok: false,
        error: new GenerateLearningUnitError(
          "no_structured_output",
          "The model ended its turn without submitting a learning unit.",
        ),
      }
    }

    // Feed the requested tool results back and let the model continue.
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of reads) {
      if (block.name === READ_SNAPSHOT_FILE_TOOL.name) {
        toolResults.push(
          await readSnapshotFileResult(
            block,
            fileTreeSet,
            input.readSnapshotFile,
          ),
        )
      } else {
        toolResults.push(readProjectMapNodeResult(block, projectMap))
      }
    }
    messages.push({ role: "assistant", content: result.data.content })
    messages.push({ role: "user", content: toolResults })
  }

  return {
    ok: false,
    error: new GenerateLearningUnitError(
      "no_structured_output",
      "The learning-unit generation call did not converge within its turn " +
        "budget.",
    ),
  }
}
