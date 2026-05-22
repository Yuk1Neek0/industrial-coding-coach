// The bounded Anthropic SDK call that produces a diff review
// (diff-review PRD FR-3, Issue #112).
//
// `reviewDiff` turns a pull request's change model (Issue #111) into the
// structured, project-tied review the M8 Diff Review Coach persists: a
// plain-language explanation of each changed file, an explanation of the PR's
// core logic, a risk analysis, test suggestions, and the comprehension
// questions the user must answer to defend the change.
//
// Per ADR 0005 it is a *bounded* prompt → structured-output call on the
// `@workspace/ai` (llm-foundation) client — not an autonomous agent. It is
// bounded three ways: a fixed two-tool set, a hard iteration cap, and a forced
// structured-output submission on the final turn. The model may call
// `read_pr_file` to inspect a changed file's full diff so every explanation
// and risk cites real code; it returns the result through `submit_diff_review`.
//
// The call runs server-side only and never throws for an expected boundary
// failure — it returns a discriminated {@link ReviewDiffResult}, mirroring the
// M5 `explainStack` and the `@workspace/ai` error patterns.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient, type LlmClient, type LlmError } from "@workspace/ai"

import type {
  ChangedFile,
  DiffHunk,
  PullRequestChangeModel,
} from "../github/pull-requests"
import {
  checkReviewFileReferences,
  type DiffReviewContent,
  type DiffReviewFileReferenceCheck,
} from "./reviews"

/**
 * Hard cap on prompt → response round-trips. The model needs turns to read the
 * changed files and one to submit; the cap keeps a misbehaving call bounded
 * (ADR 0005) — the final turn forces the submission tool, so the call always
 * terminates.
 */
const MAX_ITERATIONS = 6

/** Output-token cap — the structured review is larger than a chat reply. */
const REVIEW_MAX_TOKENS = 4096

/** Most changed files to list in the prompt — keeps a very large PR bounded. */
const MAX_LISTED_FILES = 300

// --- Error model -----------------------------------------------------------

/** The distinct failure modes {@link reviewDiff} recognizes. */
export type ReviewDiffErrorKind =
  /** The change model carried no changed files — there is nothing to review. */
  | "empty_change_model"
  /** The underlying LLM call failed — carries the mapped {@link LlmError}. */
  | "llm_error"
  /** The model never returned a usable structured review. */
  | "no_structured_output"

/** A typed failure from the diff review call. */
export class ReviewDiffError extends Error {
  readonly kind: ReviewDiffErrorKind
  /** The underlying LLM error, when `kind` is `llm_error`. */
  readonly cause?: LlmError

  constructor(kind: ReviewDiffErrorKind, message: string, cause?: LlmError) {
    super(message)
    this.name = "ReviewDiffError"
    this.kind = kind
    if (cause) this.cause = cause
  }
}

/** The successful payload of a diff review call. */
export interface ReviewDiffData {
  /** The structured review, ready to persist via `saveDiffReview`. */
  content: DiffReviewContent
  /** The FR-4 integrity check of the review's cited changed-file paths. */
  fileReferences: DiffReviewFileReferenceCheck
}

/** The discriminated result of {@link reviewDiff} — never thrown. */
export type ReviewDiffResult =
  | { ok: true; data: ReviewDiffData }
  | { ok: false; error: ReviewDiffError }

/** Input for {@link reviewDiff}. */
export interface ReviewDiffInput {
  /**
   * The pull request's change model (Issue #111) — the input contract the
   * review reasons over: PR metadata, the changed-file list with parsed hunks,
   * and the linked issue's acceptance criteria where one exists.
   */
  changeModel: PullRequestChangeModel
  /**
   * LLM client to run the call on. Injectable so tests pass a client built on
   * the `@workspace/ai/testing` mock transport — CI runs with no API key and
   * makes no live calls. Omitted → a real client built from `ANTHROPIC_API_KEY`.
   */
  client?: LlmClient
}

// --- Tool definitions ------------------------------------------------------

/** Tool the model calls to read one changed file's full parsed diff. */
const READ_FILE_TOOL: Anthropic.Tool = {
  name: "read_pr_file",
  description:
    "Read the full parsed unified diff of one file changed by this pull " +
    "request, by its repo-relative path. Use this to ground every " +
    "explanation and risk in the PR's actual hunks.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description:
          "Repo-relative path of a changed file, e.g. apps/web/app/page.tsx.",
      },
    },
    required: ["path"],
  },
}

/** Tool the model calls exactly once to return the structured review. */
const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_diff_review",
  description:
    "Submit the final, structured diff review. Call this exactly once when " +
    "the review is complete. Every changed-file path cited must be a real " +
    "path the pull request changed, and every risk must reference a changed " +
    "file or hunk.",
  input_schema: {
    type: "object",
    properties: {
      changedFiles: {
        type: "array",
        description:
          "One entry per changed file worth explaining — what changed in " +
          "the file and why it matters, in plain language.",
        items: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "A real repo-relative path the PR changed.",
            },
            explanation: {
              type: "string",
              description:
                "What changed in THIS file and why it matters, in plain " +
                "language, referencing the file's actual hunks.",
            },
          },
          required: ["path", "explanation"],
        },
      },
      coreLogicExplanation: {
        type: "string",
        description:
          "A plain-language explanation of the pull request's core logic — " +
          "what the change does as a whole, grounded in the actual diff.",
      },
      riskAnalysis: {
        type: "array",
        description:
          "Risks the pull request introduces. Each risk must be tied to a " +
          "changed file or hunk — never a generic caution.",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "A short risk label." },
            detail: {
              type: "string",
              description:
                "What could go wrong and where it would surface, " +
                "referencing the changed file or hunk it stems from.",
            },
          },
          required: ["title", "detail"],
        },
      },
      testSuggestions: {
        type: "array",
        description: "Tests that would cover the change.",
        items: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "What the suggested test should verify.",
            },
            rationale: {
              type: "string",
              description: "Why this test matters for the change.",
            },
          },
          required: ["description", "rationale"],
        },
      },
      comprehensionQuestions: {
        type: "array",
        description:
          "Questions the user must answer to prove they understand and can " +
          "defend the change in an interview.",
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
    },
    required: [
      "changedFiles",
      "coreLogicExplanation",
      "riskAnalysis",
      "testSuggestions",
      "comprehensionQuestions",
    ],
  },
}

const SYSTEM_PROMPT =
  "You are a coding coach helping a job-seeking junior developer understand " +
  "and defend a pull request they built with heavy AI assistance. Your job " +
  "is to review the change so they can explain it in an interview — grounded " +
  "in the PR's actual diff, never generic advice.\n\n" +
  "You are given the pull request's change model: its metadata, the linked " +
  "issue's acceptance criteria where one exists, the changed-file list, and " +
  "a read_pr_file tool to inspect any changed file's full parsed diff. Read " +
  "the files you need to ground every claim in real hunks. Then call " +
  "submit_diff_review exactly once.\n\n" +
  "Explain each changed file in plain language, explain the PR's core logic " +
  "as a whole, give a risk analysis where every risk is tied to a specific " +
  "changed file or hunk, suggest tests that would cover the change, and " +
  "write comprehension questions the user must answer to defend it. Cite " +
  "only real paths the PR changed. If the change model is marked truncated, " +
  "review what you can and note the partial coverage."

// --- Helpers ---------------------------------------------------------------

/** A tool-use content block, narrowed from a response's content. */
type ToolUseBlock = Extract<Anthropic.ContentBlock, { type: "tool_use" }>

/** Collect the tool-use blocks from a response's content. */
function toolUseBlocks(content: Anthropic.ContentBlock[]): ToolUseBlock[] {
  return content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  )
}

/** Render one parsed hunk back into readable unified-diff text. */
function renderHunk(hunk: DiffHunk): string {
  const header =
    `@@ -${hunk.oldStart},${hunk.oldLines} ` +
    `+${hunk.newStart},${hunk.newLines} @@` +
    (hunk.header ? ` ${hunk.header}` : "")
  const body = hunk.lines
    .map((line) => {
      const marker = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "
      return `${marker}${line.content}`
    })
    .join("\n")
  return body ? `${header}\n${body}` : header
}

/** Render a changed file's full diff as text for a `read_pr_file` result. */
function renderChangedFile(file: ChangedFile): string {
  const heading =
    `File: ${file.path} (${file.status}, +${file.additions} ` +
    `-${file.deletions})` +
    (file.previousPath ? `\nRenamed from: ${file.previousPath}` : "")
  if (file.patchOmitted) {
    return (
      `${heading}\n` +
      "No parseable patch is available for this file (binary, omitted, or " +
      "too large). Review it by its add/delete counts only."
    )
  }
  if (file.hunks.length === 0) {
    return `${heading}\nThis file has no diff hunks.`
  }
  return `${heading}\n\n${file.hunks.map(renderHunk).join("\n")}`
}

/** Build the initial user prompt: PR identity, linked issue, changed files. */
function buildInitialPrompt(model: PullRequestChangeModel): string {
  const { repo, number, title, body, head, base } = model
  const fileLines = model.files
    .slice(0, MAX_LISTED_FILES)
    .map(
      (file) =>
        `- ${file.path} (${file.status}, +${file.additions} ` +
        `-${file.deletions}${file.patchOmitted ? ", patch omitted" : ""})`,
    )
  const fileBlock =
    model.files.length > MAX_LISTED_FILES
      ? `${fileLines.join("\n")}\n…(changed-file list truncated)`
      : fileLines.join("\n")

  const issueBlock = model.linkedIssue
    ? [
        "",
        `## Linked issue #${model.linkedIssue.number}: ` +
          model.linkedIssue.title,
        ...(model.linkedIssue.acceptanceCriteria.length > 0
          ? [
              "Acceptance criteria:",
              ...model.linkedIssue.acceptanceCriteria.map(
                (criterion) =>
                  `- [${criterion.checked ? "x" : " "}] ${criterion.text}`,
              ),
            ]
          : ["(The linked issue has no acceptance-criteria checklist.)"]),
      ].join("\n")
    : "\n(This pull request has no linked issue.)"

  const truncationNote = model.truncated
    ? "\n\nNote: this PR was too large to model fully — the changed-file " +
      "list is a partial prefix. Note the partial coverage in your review."
    : ""

  return (
    `Review the pull request ${repo.owner}/${repo.repo} #${number}.\n\n` +
    `## Pull request\n` +
    `- Title: ${title}\n` +
    `- Head: ${head.ref} (${head.sha})\n` +
    `- Base: ${base.ref} (${base.sha})\n` +
    `- Total changes: +${model.additions} -${model.deletions} across ` +
    `${model.changedFileCount} file(s)\n` +
    `- Description: ${body && body.trim() ? body.trim() : "(none)"}\n` +
    `${issueBlock}\n\n` +
    `## Changed files (read any with read_pr_file)\n${fileBlock}` +
    `${truncationNote}\n\n` +
    `Read the diffs you need, then call submit_diff_review.`
  )
}

/** Resolve a `read_pr_file` call to a tool-result content block. */
function readFileResult(
  block: ToolUseBlock,
  fileByPath: Map<string, ChangedFile>,
): Anthropic.ToolResultBlockParam {
  const input = block.input as { path?: unknown }
  const path = typeof input?.path === "string" ? input.path : ""
  const file = fileByPath.get(path)
  if (file === undefined) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content:
        `No file at "${path}" was changed by this pull request. ` +
        `Changed files: ${[...fileByPath.keys()].join(", ")}.`,
    }
  }
  return {
    type: "tool_result",
    tool_use_id: block.id,
    content: renderChangedFile(file),
  }
}

/** A non-empty trimmed string, or `null`. */
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

/**
 * Validate and coerce a `submit_diff_review` tool input into a
 * {@link DiffReviewContent}. Returns `null` when the input is not a usable
 * review object (so the caller fails with `no_structured_output`). Malformed
 * individual list entries are dropped rather than failing the whole call.
 *
 * Comprehension-question ids are de-duplicated: a question with a blank or
 * already-seen id is given a stable generated id, so the questions' shape is a
 * clean input contract for the grading call (#113).
 */
export function parseReviewContent(
  input: unknown,
): DiffReviewContent | null {
  if (typeof input !== "object" || input === null) return null
  const record = input as Record<string, unknown>

  const coreLogicExplanation = str(record.coreLogicExplanation)
  if (!coreLogicExplanation) return null

  const changedFiles = Array.isArray(record.changedFiles)
    ? record.changedFiles.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return []
        const f = raw as Record<string, unknown>
        const path = str(f.path)
        const explanation = str(f.explanation)
        return path && explanation ? [{ path, explanation }] : []
      })
    : []

  const riskAnalysis = Array.isArray(record.riskAnalysis)
    ? record.riskAnalysis.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return []
        const r = raw as Record<string, unknown>
        const title = str(r.title)
        const detail = str(r.detail)
        return title && detail ? [{ title, detail }] : []
      })
    : []

  const testSuggestions = Array.isArray(record.testSuggestions)
    ? record.testSuggestions.flatMap((raw) => {
        if (typeof raw !== "object" || raw === null) return []
        const t = raw as Record<string, unknown>
        const description = str(t.description)
        const rationale = str(t.rationale)
        return description && rationale ? [{ description, rationale }] : []
      })
    : []

  const seenIds = new Set<string>()
  const comprehensionQuestions = Array.isArray(record.comprehensionQuestions)
    ? record.comprehensionQuestions.flatMap((raw, index) => {
        if (typeof raw !== "object" || raw === null) return []
        const q = raw as Record<string, unknown>
        const prompt = str(q.prompt)
        if (!prompt) return []
        const rawId = str(q.id)
        // Ensure every question has a stable, unique id — the grading call
        // (#113) keys the user's answers by it.
        let id = rawId ?? `q${index + 1}`
        if (seenIds.has(id)) id = `q${index + 1}`
        seenIds.add(id)
        return [{ id, prompt }]
      })
    : []

  // A review with no core-logic explanation, no changed-file explanations, and
  // no comprehension questions is not a usable review.
  if (changedFiles.length === 0 && comprehensionQuestions.length === 0) {
    return null
  }

  return {
    changedFiles,
    coreLogicExplanation,
    riskAnalysis,
    testSuggestions,
    comprehensionQuestions,
  }
}

// --- The bounded call ------------------------------------------------------

/**
 * Produce a structured diff review for a pull request's change model
 * (PRD FR-3).
 *
 * Makes a bounded tool-use call on the `@workspace/ai` client: the model may
 * read any changed file's full parsed diff through `read_pr_file`, and returns
 * the review through `submit_diff_review`. On the final allowed turn the
 * submission tool is forced, so the call always terminates with structured
 * output or a typed failure.
 *
 * The returned content is verified against the change model with
 * {@link checkReviewFileReferences}; the result reports the integrity outcome
 * but does not throw on a bad reference — persisting and surfacing it is the
 * caller's choice.
 */
export async function reviewDiff(
  input: ReviewDiffInput,
): Promise<ReviewDiffResult> {
  const { changeModel } = input

  if (changeModel.files.length === 0) {
    return {
      ok: false,
      error: new ReviewDiffError(
        "empty_change_model",
        `Pull request ${changeModel.repo.owner}/${changeModel.repo.repo} ` +
          `#${changeModel.number} has no changed files to review.`,
      ),
    }
  }

  const fileByPath = new Map(changeModel.files.map((file) => [file.path, file]))

  const client = input.client ?? createLlmClient()
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildInitialPrompt(changeModel) },
  ]

  for (let turn = 0; turn < MAX_ITERATIONS; turn += 1) {
    const lastTurn = turn === MAX_ITERATIONS - 1
    const result = await client.complete({
      system: SYSTEM_PROMPT,
      cacheSystem: true,
      messages,
      maxTokens: REVIEW_MAX_TOKENS,
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
        error: new ReviewDiffError(
          "llm_error",
          `The diff review call failed: ${result.error.message}`,
          result.error,
        ),
      }
    }

    const calls = toolUseBlocks(result.data.content)
    const submission = calls.find((c) => c.name === SUBMIT_TOOL.name)
    if (submission) {
      const content = parseReviewContent(submission.input)
      if (!content) {
        return {
          ok: false,
          error: new ReviewDiffError(
            "no_structured_output",
            "The model's submitted review was empty or malformed.",
          ),
        }
      }
      return {
        ok: true,
        data: {
          content,
          fileReferences: checkReviewFileReferences(content, changeModel),
        },
      }
    }

    const reads = calls.filter((c) => c.name === READ_FILE_TOOL.name)
    if (reads.length === 0) {
      // No tool use and no submission — the model stalled.
      return {
        ok: false,
        error: new ReviewDiffError(
          "no_structured_output",
          "The model ended its turn without submitting a review.",
        ),
      }
    }

    // Feed the requested file diffs back and let the model continue.
    messages.push({ role: "assistant", content: result.data.content })
    messages.push({
      role: "user",
      content: reads.map((block) => readFileResult(block, fileByPath)),
    })
  }

  return {
    ok: false,
    error: new ReviewDiffError(
      "no_structured_output",
      "The diff review call did not converge within its turn budget.",
    ),
  }
}
