// The bounded Anthropic SDK call that generates résumé bullets
// (learning-memory-portfolio-export PRD FR-2 / US-2, Issue #181).
//
// `generateResumeBullets` turns an imported snapshot's M5/M6/M7/M9 rows into
// a typed {@link ResumeBullet[]} in industry-standard
// "verb + outcome + technology" form. Each bullet:
//
//   - starts with a strong past-tense verb (Built, Implemented, Shipped, ...),
//   - states a concrete outcome,
//   - names at least one real M5 stack technology in `technologies`,
//   - cites zero or more M6-mapped files in `sourceFiles`,
//   - fits in **≤ 160 characters** (PRD US-2 — hard cap, enforced in code).
//
// Per ADR 0005 this is a *bounded* prompt → structured-output call on the
// shared `@workspace/ai` (llm-foundation) client — **not LangChain**, **not
// an autonomous agent**. It is bounded three ways: a fixed five-tool set
// (the four shared M5/M6/M7/M9 reads + the submit tool — no M8 diff review;
// the bullet generator does not ground in PR-level diff reading), a hard
// iteration cap (≤ 5 turns), and a forced structured-output submission on
// the final turn.
//
// Mirrors `./generate-qa.ts` (Issue #180) so consumers learn one bounded-
// SDK-call pattern across both M10 narrative generators. Cross-call
// scaffolding (the four read tools + their renderers + the source-bundle
// loader + the tiny parsing helpers) lives in `./_sdk-shared.ts`.
//
// Three post-SDK gates run on the candidate before it is returned. ANY of
// them failing throws — the partial / softened result is NEVER returned
// (PRD NFR-5):
//
//   1. **Length gate.** Every bullet's `text.length` must be ≤ 160 chars.
//      We do NOT silently truncate — a too-long bullet rejects the whole
//      pack so the caller learns the model is mis-fitting.
//   2. **Integrity gate.** {@link checkArtifactIntegrity} (Issue #177)
//      verifies every technology resolves to the M5 `tools[]` and every
//      `sourceFiles` path resolves to the M6 `keyFileMap[]`. The
//      `ResumeBullet` shape is the clean happy path for the integrity
//      check — `technologies` and `sourceFiles` are cleanly separated
//      (unlike `InterviewQA.sourceReferences` which #180 has to work
//      around).
//   3. **Verb-prefix gate.** A pragmatic shape sanity check — every
//      bullet's first word must be in a small allow-list of strong
//      past-tense verbs. Catches "I helped...", "Worked on...", and other
//      résumé-weak openers the system prompt explicitly forbids.
//
// Persistence is the caller's job (task #184 wires this through
// `upsertMemory`); this function only generates + validates.

import type Anthropic from "@anthropic-ai/sdk"
import { createLlmClient, type LlmClient, type LlmError } from "@workspace/ai"

import type { CatalogDb } from "../client"
import type { ResumeBullet } from "../schema"
import {
  checkArtifactIntegrity,
  type IntegrityResult,
} from "./integrity"
import {
  READ_CHALLENGE_ATTEMPT_TOOL,
  READ_LEARNING_UNIT_TOOL,
  READ_PROJECT_MAP_ENTRY_TOOL,
  READ_STACK_EXPLANATION_TOOL,
  loadSharedSourceBundle,
  resolveSharedToolCall,
  str,
  strArray,
  toolUseBlocks,
  type SharedSourceBundle,
} from "./_sdk-shared"

/**
 * Hard cap on prompt → response round-trips. The bullet generator only reads
 * four ground areas (no M8 diff review) and submits, so five turns is
 * comfortable headroom; the cap keeps a misbehaving call bounded (ADR 0005)
 * and the final turn forces the submission tool so termination is guaranteed.
 */
const MAX_ITERATIONS = 5

/** Output-token cap — bullets are short; ~10 bullets x ~200 tokens is plenty. */
const GENERATE_MAX_TOKENS = 2048

/** PRD US-2: bullets fit on a résumé line — hard ≤ 160 chars, enforced in code. */
const MAX_BULLET_LENGTH = 160

/**
 * Strong past-tense verbs the model's bullet text must open with. Deliberately
 * pragmatic — not exhaustive — and matches the small allow-list named in the
 * system prompt so the model can mirror the contract. Verb-prefix is
 * matched case-sensitively against the bullet's first word; the model is
 * instructed to capitalize the verb (and an industry-standard bullet always
 * does), so a lower-case opener is itself a shape violation.
 *
 * Sourced from the standard résumé-bullet vocabulary the system prompt
 * names — see `BULLET_VERB_LIST_FOR_PROMPT` for the prompt-facing copy. Both
 * lists must stay in sync; the prompt teaches the model what is allowed, the
 * regex enforces it.
 */
const BULLET_VERBS = [
  "Built",
  "Implemented",
  "Shipped",
  "Designed",
  "Wrote",
  "Reduced",
  "Improved",
  "Refactored",
  "Migrated",
  "Integrated",
  "Automated",
  "Optimized",
  "Architected",
  "Created",
  "Developed",
  "Engineered",
  "Delivered",
  "Established",
  "Introduced",
  "Launched",
  "Modernized",
  "Streamlined",
  "Composed",
  "Modeled",
] as const

/** Human-readable verb list for the system prompt (shorter than the full allow-list). */
const BULLET_VERB_LIST_FOR_PROMPT =
  "Built, Implemented, Shipped, Designed, Wrote, Reduced, Improved, " +
  "Refactored, Migrated, Integrated, Automated, Optimized, Architected, " +
  "Created, Developed, Engineered, Delivered, Established, Introduced, " +
  "Launched, Modernized, Streamlined, Composed, Modeled"

const BULLET_VERB_SET: ReadonlySet<string> = new Set<string>(BULLET_VERBS)

// ---------------------------------------------------------------------------
// Error model
// ---------------------------------------------------------------------------

/** The distinct failure modes {@link generateResumeBullets} recognizes. */
export type GenerateResumeBulletsErrorKind =
  /** The underlying LLM call failed — carries the mapped {@link LlmError}. */
  | "llm_error"
  /** The model never returned a usable structured pack. */
  | "no_structured_output"
  /** At least one bullet exceeded the {@link MAX_BULLET_LENGTH} cap. */
  | "length_violation"
  /** At least one bullet's text did not open with an allowed verb. */
  | "verb_prefix_violation"

/** A typed boundary / shape failure from {@link generateResumeBullets}. */
export class GenerateResumeBulletsError extends Error {
  readonly kind: GenerateResumeBulletsErrorKind
  /** The underlying LLM error, when `kind` is `llm_error`. */
  readonly cause?: LlmError
  /**
   * The bullets that triggered a `length_violation` or `verb_prefix_violation`
   * — undefined for boundary failures. The whole candidate pack is rejected,
   * but this list helps the caller diagnose which entries were the problem.
   */
  readonly offendingBullets?: ResumeBullet[]

  constructor(
    kind: GenerateResumeBulletsErrorKind,
    message: string,
    extras?: { cause?: LlmError; offendingBullets?: ResumeBullet[] },
  ) {
    super(message)
    this.name = "GenerateResumeBulletsError"
    this.kind = kind
    if (extras?.cause) this.cause = extras.cause
    if (extras?.offendingBullets) this.offendingBullets = extras.offendingBullets
  }
}

/**
 * Thrown when a generated résumé-bullet pack fails the file + stack reference
 * integrity check (PRD NFR-5). This is a hard failure — the candidate is
 * **not** returned to the caller (so callers cannot accidentally persist a
 * softened result).
 *
 * Mirrors {@link InterviewQAIntegrityError} in `./generate-qa.ts` so consumers
 * learn one error shape across the two M10 generators.
 */
export class ResumeBulletsIntegrityError extends Error {
  /** The integrity-check result — `ok: false` with the `missing` list. */
  readonly integrity: Extract<IntegrityResult, { ok: false }>
  /** The (rejected) candidate the model produced — for diagnostics only. */
  readonly candidate: ResumeBullet[]

  constructor(
    candidate: ResumeBullet[],
    integrity: Extract<IntegrityResult, { ok: false }>,
  ) {
    super(
      `Generated résumé bullets rejected: ${integrity.missing.length} ` +
        `reference(s) do not resolve to the M6 project map or the M5 ` +
        `stack explanation (${integrity.missing.join(", ")}). ` +
        `PRD NFR-5 forbids softening — the candidate is rejected.`,
    )
    this.name = "ResumeBulletsIntegrityError"
    this.integrity = integrity
    this.candidate = candidate
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options for {@link generateResumeBullets}. */
export interface GenerateResumeBulletsOptions {
  /**
   * LLM client to run the call on. Injectable so tests pass a client built on
   * the `@workspace/ai/testing` mock transport — CI runs with no API key and
   * makes no live calls. Omitted → a real client built from
   * `ANTHROPIC_API_KEY`.
   */
  client?: LlmClient
  /** Catalog DB. Injectable for tests; omitted → the package-local default. */
  db?: CatalogDb
}

// ---------------------------------------------------------------------------
// Submit tool — the forced final tool
// ---------------------------------------------------------------------------

/** Tool the model calls exactly once to return the structured résumé bullets. */
const SUBMIT_TOOL: Anthropic.Tool = {
  name: "submit_resume_bullets",
  description:
    "Submit the final, structured résumé bullets. Call this exactly once " +
    "when the pack is complete. Every `technologies` entry MUST be a tool " +
    "name the M5 stack explanation's `tools[]` list names; every " +
    "`sourceFiles` entry MUST be a file path the M6 project map's " +
    "key-file list names. Matching is case-sensitive. Every `text` field " +
    "MUST be ≤ 160 characters and MUST start with a strong past-tense " +
    "verb in 'verb + outcome + technology' form.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description:
          "The résumé bullets. Aim for 4–8 bullets that, together, cover " +
          "the most résumé-worthy claims this project supports.",
        items: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description:
                "The résumé-bullet text in 'verb + outcome + technology' " +
                "form. ≤ 160 characters. Must open with a strong past-" +
                "tense verb from the allow-list.",
            },
            technologies: {
              type: "array",
              description:
                "Stack technology names from the M5 `tools[]` list that " +
                "the bullet cites. Case-sensitive matching.",
              items: { type: "string" },
            },
            sourceFiles: {
              type: "array",
              description:
                "File paths from the M6 `keyFileMap[]` that ground the " +
                "bullet's claim. Case-sensitive matching. Empty is " +
                "allowed when the claim is grounded purely in a stack " +
                "decision (e.g. an M5-only bullet).",
              items: { type: "string" },
            },
          },
          required: ["text", "technologies", "sourceFiles"],
        },
      },
    },
    required: ["items"],
  },
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT =
  "You are a coding coach helping a job-seeking junior developer turn the " +
  "project they built (with heavy AI assistance) into résumé bullets they " +
  "can defend in interviews. Your output is a typed pack of " +
  "industry-standard résumé bullets in 'verb + outcome + technology' form.\n\n" +
  "You are given four `read_*` tools to inspect this snapshot's M5/M6/M7/" +
  "M9 rows, and `submit_resume_bullets` to return the pack:\n" +
  "  - read_stack_explanation    — M5 stack technologies (the AUTHORITATIVE\n" +
  "                                set of names allowed in `technologies`);\n" +
  "  - read_project_map_entry    — M6 architecture + key files (the\n" +
  "                                AUTHORITATIVE set of paths allowed in\n" +
  "                                `sourceFiles`);\n" +
  "  - read_learning_unit        — M7 per-issue learning units, for the\n" +
  "                                concrete features and concepts shipped;\n" +
  "  - read_challenge_attempt    — M9 debug/expansion attempts, for\n" +
  "                                debugging-skills bullets.\n\n" +
  "Hard rules:\n" +
  "- **Shape.** Every bullet's `text` MUST follow 'verb + outcome + " +
  "  technology':\n" +
  "    1. opens with a strong past-tense verb (one of: " +
  BULLET_VERB_LIST_FOR_PROMPT +
  ") — capitalized;\n" +
  "    2. states a concrete OUTCOME the project achieved (a feature " +
  "       shipped, a metric moved, a problem solved — NOT 'worked on');\n" +
  "    3. names at least ONE real technology from the M5 stack list.\n" +
  "  Résumé-weak openers — 'Helped', 'Worked on', 'Was responsible for', " +
  "  'Assisted with', 'Participated in' — are FORBIDDEN.\n" +
  "- **Length.** Every `text` MUST be ≤ 160 characters (PRD US-2 — the\n" +
  "  bullet has to fit on a résumé line). Bullets longer than 160 chars\n" +
  "  reject the whole pack — DO NOT submit a long bullet hoping it will\n" +
  "  be truncated for you.\n" +
  "- **Grounding.** Every `technologies` entry MUST appear verbatim in\n" +
  "  the M5 stack `tools[]` list (case-sensitive). Every `sourceFiles`\n" +
  "  entry MUST appear verbatim in the M6 `keyFileMap[]` list\n" +
  "  (case-sensitive). Adjacent-file inference and case-mangled tool\n" +
  "  names (e.g. 'next.js' for 'Next.js') are FORBIDDEN — they will\n" +
  "  fail integrity.\n" +
  "- **No invention.** If a claim cannot be grounded in a real M5 / M6 /\n" +
  "  M7 / M9 row you have read, DO NOT invent it. A smaller, accurate\n" +
  "  pack beats a larger, soft one.\n" +
  "- **Quantity.** Aim for 4–8 bullets total — enough to cover the\n" +
  "  résumé-worthy claims, few enough to fit on one section.\n" +
  "- Read what you need to ground each bullet, then call " +
  "  `submit_resume_bullets` exactly once."

// ---------------------------------------------------------------------------
// Source bundle — uses the shared loader directly (no extra reads)
// ---------------------------------------------------------------------------

/** Build the initial user prompt: a brief inventory of available source rows. */
function buildInitialPrompt(bundle: SharedSourceBundle): string {
  const stackBlock = bundle.stack
    ? `Available (${bundle.stack.tools.length} tool(s) explained).`
    : "Not available — do not cite stack technologies."
  const mapBlock = bundle.projectMap
    ? `Available (${bundle.projectMap.keyFileMap.length} key file(s) mapped).`
    : "Not available — do not cite source files."
  const unitsBlock =
    bundle.learningUnits.length > 0
      ? `${bundle.learningUnits.length} unit(s) available.`
      : "Not available — no per-issue learning bullets."
  const attemptCount = bundle.challengesWithAttempts.reduce(
    (sum, c) => sum + c.attempts.length,
    0,
  )
  const challengesBlock =
    attemptCount > 0
      ? `${attemptCount} challenge attempt(s) available across ` +
        `${
          bundle.challengesWithAttempts.filter((c) => c.attempts.length > 0)
            .length
        } challenge(s).`
      : "Not available — no debug-skill bullets."
  return (
    "Generate the résumé bullets for this imported snapshot. Each bullet " +
    "must follow 'verb + outcome + technology' form, fit in ≤ 160 " +
    "characters, and ground every claim in the rows below.\n\n" +
    "Inventory of source rows:\n\n" +
    `- stack            (M5): ${stackBlock}\n` +
    `- architecture     (M6): ${mapBlock}\n` +
    `- per-issue work   (M7): ${unitsBlock}\n` +
    `- debug attempts   (M9): ${challengesBlock}\n\n` +
    "Read what you need via the four `read_*` tools, then call " +
    "`submit_resume_bullets` exactly once with 4–8 bullets that cover the " +
    "résumé-worthy claims this project supports."
  )
}

// ---------------------------------------------------------------------------
// Submission parsing
// ---------------------------------------------------------------------------

/**
 * Validate and coerce a `submit_resume_bullets` tool input into a
 * `ResumeBullet[]`. Returns `null` when the input is not a usable submission
 * (so the caller fails with `no_structured_output`). Individually malformed
 * items (missing `text`, etc.) are dropped rather than failing the whole
 * call — the post-SDK gates catch shape violations on what survives.
 */
export function parseResumeBulletItems(
  input: unknown,
): ResumeBullet[] | null {
  if (typeof input !== "object" || input === null) return null
  const record = input as Record<string, unknown>
  if (!Array.isArray(record.items)) return null

  const items: ResumeBullet[] = record.items.flatMap((raw) => {
    if (typeof raw !== "object" || raw === null) return []
    const r = raw as Record<string, unknown>
    const text = str(r.text)
    if (!text) return []
    return [
      {
        text,
        technologies: strArray(r.technologies),
        sourceFiles: strArray(r.sourceFiles),
      },
    ]
  })

  if (items.length === 0) return null
  return items
}

// ---------------------------------------------------------------------------
// Post-SDK gates
// ---------------------------------------------------------------------------

/**
 * Extract the first word of a bullet's text. We tokenize on whitespace and
 * trim trailing punctuation (Built — vs Built, vs Built:) so a verb with a
 * dash / comma / colon after it still resolves cleanly. Returns the empty
 * string if the bullet text has no recognizable first word.
 */
function firstWord(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ""
  const match = trimmed.split(/\s+/)[0] ?? ""
  // Strip trailing non-letter chars (punctuation, dashes, etc.).
  return match.replace(/[^A-Za-z].*$/, "")
}

/**
 * Reject the candidate when any bullet exceeds {@link MAX_BULLET_LENGTH}.
 * Returns the offending bullets when violated, or `null` when every bullet
 * fits.
 */
function findLengthViolations(items: ResumeBullet[]): ResumeBullet[] | null {
  const offending = items.filter((b) => b.text.length > MAX_BULLET_LENGTH)
  return offending.length > 0 ? offending : null
}

/**
 * Reject the candidate when any bullet's first word is not on
 * {@link BULLET_VERB_SET}. Returns the offending bullets, or `null` when
 * every bullet opens with an allowed verb.
 */
function findVerbPrefixViolations(
  items: ResumeBullet[],
): ResumeBullet[] | null {
  const offending = items.filter((b) => !BULLET_VERB_SET.has(firstWord(b.text)))
  return offending.length > 0 ? offending : null
}

// ---------------------------------------------------------------------------
// The bounded call
// ---------------------------------------------------------------------------

const LEARNING_UNIT_EMPTY_SENTINEL =
  "no learning units — no M7 `learning_units` rows exist for this " +
  "snapshot. Do not produce per-issue 'shipped feature' bullets."

const CHALLENGE_ATTEMPT_EMPTY_SENTINEL =
  "no challenge attempts — no `challenge_attempts` rows exist for this " +
  "snapshot. Do not produce debug-skill bullets."

/**
 * Produce a typed résumé-bullet pack for an imported snapshot
 * (PRD FR-2 / US-2, Issue #181).
 *
 * Makes a bounded tool-use call on the `@workspace/ai` client: the model may
 * read the M5/M6/M7/M9 rows through four `read_*` tools, and returns the
 * pack through `submit_resume_bullets`. On the final allowed turn the
 * submission tool is forced, so the call always terminates with structured
 * output or a typed boundary failure.
 *
 * The returned pack passes three gates before it is returned to the caller:
 *
 *   1. **Length gate.** Every bullet's `text.length` ≤ 160 chars
 *      ({@link MAX_BULLET_LENGTH}). A violation throws
 *      {@link GenerateResumeBulletsError} with `kind: "length_violation"`.
 *   2. **Integrity gate.** {@link checkArtifactIntegrity} (Issue #177)
 *      verifies every `technologies` entry resolves to the M5 `tools[]` and
 *      every `sourceFiles` entry resolves to the M6 `keyFileMap[]`. A
 *      violation throws {@link ResumeBulletsIntegrityError}.
 *   3. **Verb-prefix gate.** Every bullet's first word must be in
 *      {@link BULLET_VERB_SET}. A violation throws
 *      {@link GenerateResumeBulletsError} with `kind:
 *      "verb_prefix_violation"`.
 *
 * Any gate failure rejects the whole pack — the candidate is NOT softened
 * and NOT returned (PRD NFR-5). Persistence is the caller's job (task #184).
 */
export async function generateResumeBullets(
  snapshotId: number,
  options?: GenerateResumeBulletsOptions,
): Promise<ResumeBullet[]> {
  const db = options?.db
  const bundle = await loadSharedSourceBundle(snapshotId, db)

  const client = options?.client ?? createLlmClient()
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildInitialPrompt(bundle) },
  ]

  let parsed: ResumeBullet[] | null = null
  for (let turn = 0; turn < MAX_ITERATIONS; turn += 1) {
    const lastTurn = turn === MAX_ITERATIONS - 1
    const result = await client.complete({
      system: SYSTEM_PROMPT,
      cacheSystem: true,
      messages,
      maxTokens: GENERATE_MAX_TOKENS,
      tools: [
        READ_STACK_EXPLANATION_TOOL,
        READ_PROJECT_MAP_ENTRY_TOOL,
        READ_LEARNING_UNIT_TOOL,
        READ_CHALLENGE_ATTEMPT_TOOL,
        SUBMIT_TOOL,
      ],
      // On the final turn force the submission tool so the bounded call
      // always terminates with structured output rather than another read.
      toolChoice: lastTurn
        ? { type: "tool", name: SUBMIT_TOOL.name }
        : { type: "auto" },
    })

    if (!result.ok) {
      throw new GenerateResumeBulletsError(
        "llm_error",
        `The résumé-bullet generation call failed: ${result.error.message}`,
        { cause: result.error },
      )
    }

    const calls = toolUseBlocks(result.data.content)
    const submission = calls.find((c) => c.name === SUBMIT_TOOL.name)
    if (submission) {
      const items = parseResumeBulletItems(submission.input)
      if (!items) {
        throw new GenerateResumeBulletsError(
          "no_structured_output",
          "The model's submitted résumé-bullet pack was empty or malformed.",
        )
      }
      parsed = items
      break
    }

    const reads = calls.filter((c) => c.name !== SUBMIT_TOOL.name)
    if (reads.length === 0) {
      throw new GenerateResumeBulletsError(
        "no_structured_output",
        "The model ended its turn without submitting a résumé-bullet pack.",
      )
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of reads) {
      const resolved = await resolveSharedToolCall(
        block,
        snapshotId,
        bundle,
        {
          learningUnitEmpty: LEARNING_UNIT_EMPTY_SENTINEL,
          challengeAttemptEmpty: CHALLENGE_ATTEMPT_EMPTY_SENTINEL,
        },
        db,
      )
      toolResults.push(
        resolved ?? {
          type: "tool_result",
          tool_use_id: block.id,
          is_error: true,
          content: `Unknown tool "${block.name}".`,
        },
      )
    }
    messages.push({ role: "assistant", content: result.data.content })
    messages.push({ role: "user", content: toolResults })
  }

  if (!parsed) {
    throw new GenerateResumeBulletsError(
      "no_structured_output",
      "The résumé-bullet generation call did not converge within its turn " +
        "budget.",
    )
  }

  // -------------------------------------------------------------------------
  // Gate 1: length (US-2). Reject — do NOT truncate. If the model is
  // producing too-long bullets, that is a contract violation the caller
  // needs to know about; silently shortening would hide it.
  // -------------------------------------------------------------------------
  const tooLong = findLengthViolations(parsed)
  if (tooLong) {
    const previews = tooLong
      .map((b) => `"${b.text.slice(0, 40)}..." (${b.text.length} chars)`)
      .join(", ")
    throw new GenerateResumeBulletsError(
      "length_violation",
      `Generated résumé bullets rejected: ${tooLong.length} bullet(s) ` +
        `exceed the ${MAX_BULLET_LENGTH}-character cap (US-2): ${previews}. ` +
        `PRD NFR-5 forbids softening — the candidate is rejected.`,
      { offendingBullets: tooLong },
    )
  }

  // -------------------------------------------------------------------------
  // Gate 2: integrity (NFR-5). The résumé-bullet shape is the clean happy
  // path for `checkArtifactIntegrity` — `technologies` and `sourceFiles`
  // are cleanly separated, so the shipped helper does exactly the right
  // thing without the OR-union workaround `generateInterviewQA` needs.
  // -------------------------------------------------------------------------
  const integrity = await checkArtifactIntegrity(
    snapshotId,
    { resumeBullets: parsed },
    db,
  )
  if (!integrity.ok) {
    throw new ResumeBulletsIntegrityError(parsed, integrity)
  }

  // -------------------------------------------------------------------------
  // Gate 3: verb prefix (shape sanity). A pragmatic check that catches
  // résumé-weak openers ("Helped...", "Worked on...") the system prompt
  // explicitly forbids. The allow-list is small on purpose — false
  // positives are easy to fix by adding a verb; false negatives ("Maybe
  // built...") are precisely what we are guarding against.
  // -------------------------------------------------------------------------
  const badPrefix = findVerbPrefixViolations(parsed)
  if (badPrefix) {
    const previews = badPrefix
      .map((b) => `"${b.text.slice(0, 60)}..."`)
      .join(", ")
    throw new GenerateResumeBulletsError(
      "verb_prefix_violation",
      `Generated résumé bullets rejected: ${badPrefix.length} bullet(s) ` +
        `do not open with an allowed past-tense verb (allow-list: ` +
        `${BULLET_VERBS.join(", ")}): ${previews}. PRD NFR-5 forbids ` +
        `softening — the candidate is rejected.`,
      { offendingBullets: badPrefix },
    )
  }

  return parsed
}
