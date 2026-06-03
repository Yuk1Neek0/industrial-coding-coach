// Observability teaching layer (Issue #223, M13 epic llm-observability, Part B).
//
// Deterministic, beginner-first explanations of how an LLM app is (and isn't)
// observed, PARAMETERIZED by the real Part-B story (Issue #221) — "this repo
// uses the Anthropic SDK, calls the model in 3 places, has no tracing or eval
// tooling" — not static boilerplate. No LLM (epic AD-3): the copy is templated
// and filled from the analyzer's findings, so every explanation references the
// actual artifacts in front of the user without an SDK call. Also supplies the
// calm educational copy for the `absent` (no LLM app detected) state.
//
// Mirrors the M12 CCPM teaching layer (`ccpm/teaching.ts`, Issue #202): a pure,
// parameterized teaching builder with a small templating table, a typed output
// structure the UI renders, and no SDK/LLM import. PURE + deterministic: the
// same story always yields the same output, stably ordered.

import type {
  CallSite,
  DetectedSdk,
  LlmAppStory,
  NoLlmApp,
  ObservabilityStory,
  ToolingSignal,
} from "./detect"

/**
 * The three observability concepts a junior dev should be able to speak to in an
 * interview, each tied to what THIS repo has or lacks.
 */
export type ObservabilityConcept = "tracing" | "failures" | "evals"

/**
 * One concept explanation, parameterized by the real story. Splits "what the
 * repo HAS now" from "what a production setup would ADD" so the UI can render
 * the gap, and gives the user a ready interview answer for the concept.
 */
export interface ObservabilityConceptCard {
  concept: ObservabilityConcept
  /** Short title, e.g. "Tracing — see every model call". */
  title: string
  /** Plain-language definition of the concept — no undefined jargon. */
  what: string
  /** What this repo already has for this concept, in its own terms. */
  present: string
  /** What a production setup would add on top — the gap to name. */
  production: string
  /** A one-line answer the user can give when asked about this concept. */
  interviewAnswer: string
}

/** The teaching content for a repo detected as an LLM application. */
export interface ObservabilityTeaching {
  kind: "llm-app"
  /** A one-line summary of the observability story, with the real findings. */
  headline: string
  /** Per-concept explanations: tracing, failures, evals — in that order. */
  concepts: ObservabilityConceptCard[]
  /** The professional / interview value, framed as the question it answers. */
  professionalValue: string[]
}

/**
 * The calm educational content for the `absent` state — no LLM app was detected.
 * NOT an error and NOT a scolding: a plain explainer of what observability is
 * and why it matters, so the user learns the concept even with no app to map it
 * onto. Mirrors `CcpmDegradationTeaching`.
 */
export interface ObservabilityExplainer {
  kind: "absent"
  title: string
  body: string
  /** Echoed from detection — what was searched for, surfaced to the user. */
  searched: string[]
  /** The three concepts, defined in beginner language, with no repo to anchor. */
  primer: { concept: ObservabilityConcept; title: string; what: string }[]
}

export type ObservabilityTeachingResult =
  | ObservabilityTeaching
  | ObservabilityExplainer

/**
 * The single interview question this whole layer prepares the user to answer.
 * Surfaced verbatim so the framing is explicit, not implied.
 */
const INTERVIEW_QUESTION =
  "How would you monitor and evaluate this in production?"

// --- Templating table ------------------------------------------------------
//
// All concept copy lives here in ONE small reviewable table. Each entry owns the
// concept's static prose (title, definition, the production-setup gap, and the
// interview answer); the `present` line is the only piece filled from the real
// story, by the function below. Keeping it in a table — not scattered string
// literals — is the same discipline as the M12 teaching builder.

interface ConceptTemplate {
  concept: ObservabilityConcept
  title: string
  what: string
  production: string
  interviewAnswer: string
  /** Build the "what the repo has now" line from the real story. */
  present: (story: LlmAppStory) => string
}

/** "1 place" / "3 places" — regular pluralization. */
function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`
}

/** Join SDK display names into a readable list, e.g. "Anthropic SDK and OpenAI SDK". */
function sdkList(sdks: DetectedSdk[]): string {
  const names = sdks.map((s) => s.name)
  if (names.length === 0) return "an AI SDK"
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}

/** Join tooling names into a readable list, for the "already instrumented" line. */
function toolingList(tooling: ToolingSignal[]): string {
  const names = tooling.map((t) => t.name)
  if (names.length === 1) return names[0]!
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`
}

/** A short, human reference to the first call site, e.g. `src/chat.ts`. */
function firstCallSiteRef(callSites: CallSite[]): string | null {
  const first = callSites[0]
  return first ? first.path : null
}

const CONCEPT_TEMPLATES: readonly ConceptTemplate[] = [
  {
    concept: "tracing",
    title: "Tracing — see every model call",
    what:
      "Tracing means recording each call to the AI model: the prompt you sent, " +
      "how many tokens it used, what it cost, and how long it took. Without it, " +
      "the model is a black box — you can't tell why a request was slow, " +
      "expensive, or wrong.",
    production:
      "A production setup adds a tracing tool (e.g. Langfuse or OpenLLMetry) " +
      "that captures the prompt, token counts, cost, and latency of every call " +
      "into a dashboard, so you can spot a slow or expensive prompt before users do.",
    interviewAnswer:
      "I'd trace every model call — prompt, tokens, cost, and latency — so the " +
      "model isn't a black box and I can see what each request actually did.",
    present: (story) => {
      const sdks = sdkList(story.sdks)
      const sites = story.callSites
      const has = story.existingTooling.filter((t) =>
        /langfuse|traceloop|openllmetry|langsmith|helicone|phoenix|arize/i.test(
          t.name,
        ),
      )
      const where =
        sites.length > 0
          ? ` — the model is called in ${count(sites.length, "place")}` +
            (firstCallSiteRef(sites)
              ? `, starting at \`${firstCallSiteRef(sites)}\``
              : "") +
            "."
          : "."
      if (has.length > 0) {
        return (
          `This repo calls the model through ${sdks}${where} It already wires up ` +
          `${toolingList(has)}, so model calls can be traced.`
        )
      }
      return (
        `This repo calls the model through ${sdks}${where} There's no tracing tool ` +
        `wired up, so right now each call's prompt, tokens, cost, and latency aren't recorded.`
      )
    },
  },
  {
    concept: "failures",
    title: "Failures — observe errors, don't swallow them",
    what:
      "Models fail in ways normal code doesn't: timeouts, rate limits, refused " +
      "or malformed answers. Observing failures means catching these and logging " +
      "them with context — NOT silently ignoring them (\"swallowing\"), which " +
      "hides real problems from you and your users.",
    production:
      "A production setup logs each failed or degraded call with its cause and " +
      "the input that triggered it, and tracks an error rate, so a spike in " +
      "timeouts or refusals is visible instead of disappearing into a try/catch.",
    interviewAnswer:
      "I'd log model failures — timeouts, rate limits, bad outputs — with context " +
      "and watch the error rate, instead of swallowing them in a try/catch.",
    present: (story) => {
      const sites = story.callSites
      const where =
        sites.length > 0
          ? `${count(sites.length, "call site")} where the model is invoked`
          : "the model calls"
      return (
        `Each of the ${where} can fail — a timeout, a rate limit, or a bad answer. ` +
        `What matters is whether those failures are logged with context rather than ` +
        `swallowed; that's a thing to check at each call site and the main gap a ` +
        `production setup would close here.`
      )
    },
  },
  {
    concept: "evals",
    title: "Evals — know your output quality",
    what:
      "An eval (evaluation) is a repeatable test of the model's OUTPUT quality: " +
      "you run a set of example inputs and score the answers, so a prompt change " +
      "that quietly makes things worse gets caught. It's the equivalent of unit " +
      "tests, but for fuzzy AI output.",
    production:
      "A production setup keeps a set of graded examples (an eval suite) and runs " +
      "it whenever the prompt or model changes — with a tool like Promptfoo or " +
      "Braintrust — so you can prove quality didn't regress instead of guessing.",
    interviewAnswer:
      "I'd build an eval set — example inputs with graded outputs — and run it on " +
      "every prompt change, so I can prove quality held up instead of eyeballing it.",
    present: (story) => {
      const evalTooling = story.existingTooling.filter((t) =>
        /eval|promptfoo|braintrust|autoevals|langsmith/i.test(t.name),
      )
      const prompts = story.promptAssets
      const promptNote =
        prompts.length > 0
          ? ` Prompts are managed as assets here (${count(prompts.length, "prompt file")}` +
            (prompts[0] ? `, e.g. \`${prompts[0].path}\`` : "") +
            "), which is exactly what an eval suite would test against."
          : " No prompt assets were found, so prompts likely live inline in the code; pulling them out is the first step toward evaluating them."
      if (evalTooling.length > 0) {
        return (
          `This repo already has eval tooling wired up (${toolingList(evalTooling)}), ` +
          `so output quality can be scored repeatably.${promptNote}`
        )
      }
      return (
        `There's no eval tooling wired up, so right now there's no repeatable check ` +
        `that the model's output quality is good — it's judged by eye.${promptNote}`
      )
    },
  },
] as const

// --- The builder -----------------------------------------------------------

/**
 * Build the observability teaching for a Part-B story, or the calm educational
 * explainer when no LLM app was detected.
 *
 * Pure and deterministic: the `llm-app` case is parameterized entirely by the
 * story's real findings — the named SDK(s), the number and location of model
 * call sites, whether tracing / eval tooling was detected, and any prompt
 * assets — so every explanation references the actual repo in front of the user.
 * The `absent` case returns a plain explainer (what observability is and why it
 * matters), never an error and never a scolding. No network, no model call.
 *
 * @param story - the discriminated-union result of `analyzeObservability`.
 */
export function buildObservabilityTeaching(
  story: ObservabilityStory,
): ObservabilityTeachingResult {
  if (story.kind === "absent") {
    return buildExplainer(story)
  }
  return buildLlmAppTeaching(story)
}

/** The `llm-app` branch — parameterized by the real findings. */
function buildLlmAppTeaching(story: LlmAppStory): ObservabilityTeaching {
  const concepts: ObservabilityConceptCard[] = CONCEPT_TEMPLATES.map(
    (template) => ({
      concept: template.concept,
      title: template.title,
      what: template.what,
      present: template.present(story),
      production: template.production,
      interviewAnswer: template.interviewAnswer,
    }),
  )

  const headline = buildHeadline(story)

  const professionalValue = [
    `Answers the interview question "${INTERVIEW_QUESTION}" with specifics from ` +
      "your own repo, not textbook theory.",
    "Names what's already instrumented vs. what production would add — so you can " +
      "talk about the gap honestly instead of overclaiming.",
    "Shows you think past \"it works on my machine\": tracing, failure handling, " +
      "and evals are what separate a demo from a production AI feature.",
  ]

  return { kind: "llm-app", headline, concepts, professionalValue }
}

/** Build the one-line summary from the story's real findings. */
function buildHeadline(story: LlmAppStory): string {
  const sdks = sdkList(story.sdks)
  const sitePart =
    story.callSites.length > 0
      ? ` and calls the model in ${count(story.callSites.length, "place")}`
      : ""
  const toolingPart =
    story.existingTooling.length > 0
      ? ` It already wires up ${toolingList(story.existingTooling)} for observability.`
      : " No observability or eval tooling is wired up yet — that's the gap to talk about."
  return (
    `This repo is an LLM app: it uses ${sdks}${sitePart}.${toolingPart} ` +
    `Here's how to talk about monitoring and evaluating it.`
  )
}

/** The `absent` branch — a calm, beginner-first explainer. */
function buildExplainer(story: NoLlmApp): ObservabilityExplainer {
  return {
    kind: "absent",
    title: "No LLM features detected — here's what observability is",
    body:
      "We looked for AI model calls in this repo and didn't find any — that's " +
      "completely normal; plenty of good projects don't use an AI model. So there's " +
      "nothing to instrument here yet, but the idea is worth knowing. " +
      "Observability for an AI feature means being able to SEE what the model is " +
      "doing in production: tracing each call (the prompt, the tokens it used, the " +
      "cost, and how long it took), noticing when calls fail instead of quietly " +
      "swallowing the error, and running evals — repeatable tests of output quality " +
      "— so a prompt change can't silently make things worse. The payoff in an " +
      "interview: when someone asks \"how would you monitor and evaluate this in " +
      "production?\", you can answer it concretely instead of going quiet.",
    searched: story.searched,
    primer: CONCEPT_TEMPLATES.map((template) => ({
      concept: template.concept,
      title: template.title,
      what: template.what,
    })),
  }
}
