import Link from "next/link"
import { notFound } from "next/navigation"

import {
  PRICE_TABLE_DATE,
  type LlmEval,
  type LlmObservation,
  type ObservabilityConceptCard,
  type ObservabilityExplainer,
  type ObservabilityPartA,
  type ObservabilityPartB,
  type ObservabilityStory,
  type ObservabilityTeaching,
  type TraceNameAggregate,
  type TraceWithEvals,
} from "@workspace/db"

import { getObservabilityPageData } from "@/lib/observability"

import {
  AppNav,
  Badge,
  IconArrowLeft,
  IconCheck,
  IconDot,
  IconRefresh,
  IconX,
} from "./_components/chrome"
import { Disclosure } from "./_components/disclosure"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface ObservabilityParams {
  params: Promise<{ owner: string; repo: string }>
}

export async function generateMetadata({ params }: ObservabilityParams) {
  const { owner, repo } = await params
  return {
    title: `Observability — ${owner}/${repo}`,
    description: `How the coach used AI on ${owner}/${repo}, and how this repo itself is instrumented.`,
  }
}

/**
 * `/observability/[owner]/[repo]` — the M13 Observability Page (Page Spec
 * §4 / §6, task #227). A React Server Component that reads the local snapshot
 * and renders two stacked panels: Part A (the coach's own AI usage on this repo
 * — traces, evals, and per-name cost/latency aggregates) and Part B (this
 * repo's observability story + the deterministic teaching). Either panel can be
 * in its own calm resting state; the page still renders the other.
 *
 * **Read-only and offline** (ADR 0009): no Server Actions, no mutations, no
 * network, no API key. Traces/evals were recorded when the bounded calls ran;
 * the Part-B teaching is deterministic. Opening the URL with `GITHUB_TOKEN` /
 * `ANTHROPIC_API_KEY` unset renders the page.
 */
export default async function ObservabilityPage({
  params,
}: ObservabilityParams) {
  const { owner, repo } = await params
  const result = await getObservabilityPageData(owner, repo)

  // Repo not imported → the not-found state (`not-found.tsx`, §11).
  if (result.kind === "no-snapshot") {
    notFound()
  }

  const { partA, partB } = result

  return (
    <div className="screen">
      <AppNav active="observability" />
      <main className="page">
        <div className="container-narrow">
          {/* ── Header (always) — §6a ──────────────────────────────── */}
          <header>
            <Link className="back-link" href="/import">
              <IconArrowLeft size={14} /> Back to imported repositories
            </Link>
            <div className="page-eyebrow" style={{ marginTop: 24 }}>
              <span className="dot" /> Observability · M13
            </div>
            <div className="review-titlewrap" style={{ marginTop: 0 }}>
              <h1 className="page-title" style={{ margin: 0 }}>
                {owner}/{repo}
              </h1>
            </div>
            <p className="page-subtitle" style={{ marginTop: 16 }}>
              How the coach used AI on this repo — and how this repo itself is
              instrumented.
            </p>
            <div
              className="status-actions"
              style={{ marginTop: 14, gap: 12, flexWrap: "wrap" }}
            >
              <span className="hint">
                Read-only · local snapshot · no network · no API key
              </span>
              <Link className="hint" href="/import">
                <IconRefresh size={12} /> Re-import to refresh
              </Link>
            </div>
          </header>

          {/* ── Part A — the coach's own AI usage (§6b) ─────────────── */}
          <PartAPanel partA={partA} />

          {/* ── Part B — this repo's observability story (§6c) ──────── */}
          <PartBPanel partB={partB} />
        </div>
      </main>
    </div>
  )
}

/* ── Formatting helpers ──────────────────────────────────────────────────── */

/** Format a USD cost as a plain estimate (always labelled "est." by the caller). */
function formatUsd(usd: number): string {
  if (usd === 0) return "$0.00"
  if (usd < 0.01) return `$${usd.toFixed(4)}`
  return `$${usd.toFixed(2)}`
}

/** Format a latency in ms as a readable duration ("820 ms" / "4.2 s"). */
function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

/** Round a `[0,1]` pass-rate to a whole-percent string. */
function formatPassRate(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/** A short, human label for a `traceName` (defensive — falls back to the raw name). */
function traceNameLabel(traceName: string): string {
  const LABELS: Record<string, string> = {
    "m7.generate-unit": "Learning-unit generation",
    "m7.grade-unit": "Learning-unit grading",
    "m9.generate-challenge": "Challenge generation",
    "m9.grade-challenge": "Challenge grading",
    "m10.generate-qa": "Interview Q&A generation",
    "m10.resume-bullets": "Résumé-bullet generation",
  }
  return LABELS[traceName] ?? traceName
}

/** A relative-ish absolute time the page renders for a trace's start. */
function formatStartedAt(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "unknown time"
  return date.toLocaleString()
}

/* ── Part A — the coach's own AI usage (§6b) ──────────────────────────────── */

function PartAPanel({ partA }: { partA: ObservabilityPartA }) {
  const isEmpty = partA.traces.length === 0 && partA.aggregates.length === 0

  return (
    <section
      className="review-section"
      aria-labelledby="h-part-a"
      style={{ marginTop: 28 }}
    >
      <div className="review-section-head">
        <h2 id="h-part-a" tabIndex={-1}>
          What the coach&apos;s AI calls cost (on this repo)
        </h2>
        <span className="hint">
          Every AI call the coach made on this repo, with model, tokens, an
          estimated cost, latency, and whether its quality check passed.
        </span>
      </div>

      {isEmpty ? (
        <PartAEmpty />
      ) : (
        <>
          <AggregateCards aggregates={partA.aggregates} />
          <TracesList traces={partA.traces} />
        </>
      )}
    </section>
  )
}

/** §6b.3 — the calm "nothing traced yet" resting state (not an error). */
function PartAEmpty() {
  return (
    <div className="file-card" style={{ marginTop: 12 }}>
      <div className="file-card-head">
        <h3 style={{ margin: 0 }}>No coach calls traced yet for this repo.</h3>
      </div>
      <p className="file-explanation" style={{ marginTop: 8 }}>
        Traces appear here after the coach runs a generate, grade, or Q&amp;A
        call on this repo. Nothing has been recorded yet — that&apos;s expected
        for a freshly imported repository.
      </p>
    </div>
  )
}

/** §6b.1 — one summary card per `traceName` aggregate. */
function AggregateCards({
  aggregates,
}: {
  aggregates: TraceNameAggregate[]
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Per-call summary</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {aggregates.map((aggregate) => (
          <li
            className="file-card"
            key={aggregate.traceName}
            style={{ marginBottom: 12 }}
          >
            <div className="file-card-head">
              <h4 style={{ margin: 0 }}>
                {traceNameLabel(aggregate.traceName)}
              </h4>
              <Badge soft mono>
                {aggregate.traceName}
              </Badge>
            </div>
            <dl style={{ marginTop: 8, display: "grid", gap: 6 }}>
              <div>
                <dt className="hint">Calls</dt>
                <dd>
                  {aggregate.callCount}{" "}
                  {aggregate.callCount === 1 ? "call" : "calls"}
                </dd>
              </div>
              <div>
                <dt className="hint">Quality checks</dt>
                <dd>
                  <PassRate aggregate={aggregate} />
                </dd>
              </div>
              <div>
                <dt className="hint">Estimated cost</dt>
                <dd>
                  {formatUsd(aggregate.averageCostUsd)} avg{" "}
                  <span className="hint">est.</span> ·{" "}
                  {formatUsd(aggregate.totalCostUsd)} total{" "}
                  <span className="hint">est.</span>
                </dd>
              </div>
              <div>
                <dt className="hint">Avg latency</dt>
                <dd>avg {formatLatency(aggregate.averageLatencyMs)}</dd>
              </div>
            </dl>
            <p className="hint" style={{ marginTop: 8 }}>
              Cost is an estimate from a price table dated {PRICE_TABLE_DATE} —
              not a bill.
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The eval pass-rate line — distinguishes "not graded" (`evalPassRate === null`)
 * from a real percentage. Conveys meaning by text + icon, never color alone.
 */
function PassRate({ aggregate }: { aggregate: TraceNameAggregate }) {
  if (aggregate.evalPassRate === null) {
    return (
      <span>
        <IconDot size={12} /> <span className="hint">not graded</span>
      </span>
    )
  }
  const allPassed = aggregate.evalPassCount === aggregate.evalCount
  return (
    <span>
      {allPassed ? <IconCheck size={12} /> : <IconX size={12} />}{" "}
      {formatPassRate(aggregate.evalPassRate)} checks passed (
      {aggregate.evalPassCount}/{aggregate.evalCount})
    </span>
  )
}

/** §6b.2 — the traces list, newest first, each with a details disclosure. */
function TracesList({ traces }: { traces: TraceWithEvals[] }) {
  // Newest first (the data layer orders oldest-first by startedAt, then id).
  const ordered = [...traces].reverse()
  return (
    <div style={{ marginTop: 20 }}>
      <h3 style={{ marginTop: 0 }}>Traces</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Newest first. Each call: model, tokens, an estimated cost, latency,
        outcome, and when it started.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {ordered.map(({ trace, evals }) => (
          <li className="file-card" key={trace.id} style={{ marginBottom: 12 }}>
            <div className="file-card-head" style={{ flexWrap: "wrap" }}>
              <h4 style={{ margin: 0 }}>{traceNameLabel(trace.name)}</h4>
              <Badge soft mono>
                {trace.name}
              </Badge>
              <Badge soft mono>
                {trace.model}
              </Badge>
              <OutcomeChip outcome={trace.outcome} />
            </div>
            <dl style={{ marginTop: 8, display: "grid", gap: 6 }}>
              <div>
                <dt className="hint">Tokens</dt>
                <dd>
                  {trace.inputTokens.toLocaleString()} in ·{" "}
                  {trace.outputTokens.toLocaleString()} out ·{" "}
                  {trace.cacheCreationTokens.toLocaleString()} cache-write ·{" "}
                  {trace.cacheReadTokens.toLocaleString()} cache-read
                </dd>
              </div>
              <div>
                <dt className="hint">Estimated cost</dt>
                <dd>
                  {formatUsd(trace.estimatedCostUsd)}{" "}
                  <span className="hint">est.</span>
                </dd>
              </div>
              <div>
                <dt className="hint">Latency</dt>
                <dd>{formatLatency(trace.latencyMs)}</dd>
              </div>
              <div>
                <dt className="hint">Started</dt>
                <dd>{formatStartedAt(trace.startedAt)}</dd>
              </div>
            </dl>
            <Disclosure summary="Details — per-turn breakdown and quality checks">
              <ObservationsList observations={trace.observations} />
              <EvalsList evals={evals} />
            </Disclosure>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A calm chip for the trace `outcome` — `success` or a failure kind. Text + icon. */
function OutcomeChip({ outcome }: { outcome: string }) {
  const ok = outcome === "success"
  return (
    <Badge soft>
      {ok ? <IconCheck size={11} /> : <IconX size={11} />}{" "}
      {ok ? "success" : `failed · ${outcome}`}
    </Badge>
  )
}

/** Per-`complete()`-turn breakdown inside the disclosure (one line per turn). */
function ObservationsList({
  observations,
}: {
  observations: LlmObservation[]
}) {
  if (observations.length === 0) {
    return (
      <p className="hint" style={{ marginTop: 0 }}>
        No per-turn breakdown was recorded for this call.
      </p>
    )
  }
  return (
    <div>
      <h5 style={{ margin: "4px 0" }}>Per-turn breakdown</h5>
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        {observations.map((turn, index) => (
          <li key={index} style={{ marginBottom: 4 }}>
            <span className="mono">{turn.model}</span> — {turn.inputTokens} in ·{" "}
            {turn.outputTokens} out · {turn.cacheCreationTokens} cache-write ·{" "}
            {turn.cacheReadTokens} cache-read · {formatLatency(turn.latencyMs)} ·{" "}
            {turn.outcome === "success" ? (
              <>
                <IconCheck size={11} /> success
              </>
            ) : (
              <>
                <IconX size={11} /> {turn.outcome}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The trace's evals inside the disclosure — check, pass/fail (text+icon), reason. */
function EvalsList({ evals }: { evals: LlmEval[] }) {
  if (evals.length === 0) {
    return (
      <p className="hint" style={{ marginTop: 8 }}>
        This call wasn&apos;t graded — no quality checks were recorded.
      </p>
    )
  }
  return (
    <div style={{ marginTop: 8 }}>
      <h5 style={{ margin: "4px 0" }}>Quality checks</h5>
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        {evals.map((evaluation) => (
          <li key={evaluation.id} style={{ marginBottom: 4 }}>
            {evaluation.passed ? (
              <>
                <IconCheck size={11} /> passed
              </>
            ) : (
              <>
                <IconX size={11} /> failed
              </>
            )}{" "}
            — <span className="mono">{evaluation.check}</span>
            {!evaluation.passed && evaluation.reason && (
              <span className="hint" style={{ marginLeft: 6 }}>
                {evaluation.reason}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Part B — this repo's observability story (§6c) ───────────────────────── */

function PartBPanel({ partB }: { partB: ObservabilityPartB }) {
  return (
    <section
      className="review-section"
      aria-labelledby="h-part-b"
      style={{ marginTop: 28 }}
    >
      <div className="review-section-head">
        <h2 id="h-part-b" tabIndex={-1}>
          How observable is THIS repo?
        </h2>
        <span className="hint">
          Whether this repo is an LLM app, what it&apos;s instrumented with, and
          how to talk about monitoring it.
        </span>
      </div>

      {partB.teaching.kind === "llm-app" ? (
        <LlmAppTeaching teaching={partB.teaching} story={partB.story} />
      ) : (
        <AbsentExplainer teaching={partB.teaching} />
      )}
    </section>
  )
}

/** §6c-i — the LLM-app detected branch, parameterized from the real story. */
function LlmAppTeaching({
  teaching,
  story,
}: {
  teaching: ObservabilityTeaching
  story: ObservabilityStory
}) {
  return (
    <>
      {/* 1. Teaching headline */}
      <p className="page-subtitle" style={{ marginTop: 12 }}>
        {teaching.headline}
      </p>

      {/* 2. Detected-signals strip */}
      {story.kind === "llm-app" && <DetectedSignals story={story} />}

      {/* 3. Concept cards */}
      <div style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>The three concepts to speak to</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {teaching.concepts.map((concept) => (
            <ConceptCard concept={concept} key={concept.concept} />
          ))}
        </ul>
      </div>

      {/* 4. Professional-value panel */}
      <div style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Why this matters in an interview</h3>
        <ul style={{ paddingLeft: 18 }}>
          {teaching.professionalValue.map((value) => (
            <li key={value} style={{ marginBottom: 6 }}>
              {value}
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

/** §6c-i.2 — the detected-signals strip, each chip with its evidence on disclosure. */
function DetectedSignals({
  story,
}: {
  story: Extract<ObservabilityStory, { kind: "llm-app" }>
}) {
  const firstCallSite = story.callSites[0]
  return (
    <div style={{ marginTop: 14 }}>
      <h3 style={{ marginTop: 0 }}>Detected signals</h3>
      <div
        className="file-counts"
        style={{ marginTop: 8, gap: 6, flexWrap: "wrap" }}
      >
        {story.sdks.map((sdk) => (
          <Badge soft key={sdk.name}>
            <IconCheck size={11} /> {sdk.name}
          </Badge>
        ))}
        <Badge soft>
          <IconCheck size={11} /> called in{" "}
          {story.callSites.length === 1
            ? "1 place"
            : `${story.callSites.length} places`}
          {firstCallSite ? `, starting at ${firstCallSite.path}` : ""}
        </Badge>
        {story.promptAssets.length > 0 && (
          <Badge soft>
            <IconCheck size={11} /> {story.promptAssets.length} prompt asset
            {story.promptAssets.length === 1 ? "" : "s"}
          </Badge>
        )}
        {story.existingTooling.length > 0 ? (
          story.existingTooling.map((tool) => (
            <Badge soft key={tool.name}>
              <IconCheck size={11} /> {tool.name} detected
            </Badge>
          ))
        ) : (
          <Badge soft>
            <IconDot size={11} /> no tracing tooling found
          </Badge>
        )}
      </div>
      <Disclosure summary="Evidence">
        <ul style={{ paddingLeft: 18, margin: 0 }}>
          {story.sdks.map((sdk) => (
            <li key={`sdk-${sdk.name}`} style={{ marginBottom: 4 }}>
              <strong>{sdk.name}</strong> —{" "}
              <span className="mono">{sdk.evidence}</span>
            </li>
          ))}
          {story.callSites.map((site) => (
            <li
              key={`site-${site.path}-${site.pattern}`}
              style={{ marginBottom: 4 }}
            >
              <span className="mono">{site.pattern}</span> in{" "}
              <span className="mono">{site.path}</span>
            </li>
          ))}
          {story.promptAssets.map((asset) => (
            <li key={`prompt-${asset.path}`} style={{ marginBottom: 4 }}>
              <span className="mono">{asset.path}</span> — {asset.reason}
            </li>
          ))}
          {story.existingTooling.map((tool) => (
            <li key={`tool-${tool.name}`} style={{ marginBottom: 4 }}>
              <strong>{tool.name}</strong> —{" "}
              <span className="mono">{tool.evidence}</span>
            </li>
          ))}
        </ul>
      </Disclosure>
    </div>
  )
}

/** §6c-i.3 — one concept card (tracing / failures / evals). Title is `<h4>`. */
function ConceptCard({ concept }: { concept: ObservabilityConceptCard }) {
  return (
    <li className="file-card" style={{ marginBottom: 12 }}>
      <div className="file-card-head">
        <h4 style={{ margin: 0 }}>{concept.title}</h4>
      </div>
      <p className="file-explanation" style={{ marginTop: 8 }}>
        {concept.what}
      </p>
      <p style={{ marginTop: 8 }}>
        <strong>In this repo:</strong> {concept.present}
      </p>
      <p style={{ marginTop: 8 }}>
        <strong>In production you&apos;d add:</strong> {concept.production}
      </p>
      <p style={{ marginTop: 8 }}>
        <strong>In an interview:</strong> {concept.interviewAnswer}
      </p>
    </li>
  )
}

/** §6c-ii — the calm educational explainer when no LLM app was detected. */
function AbsentExplainer({
  teaching,
}: {
  teaching: ObservabilityExplainer
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>{teaching.title}</h3>
      <p className="file-explanation">{teaching.body}</p>
      <p className="hint" style={{ marginTop: 8 }}>
        We looked for: {teaching.searched.join(", ")}
      </p>
      <div style={{ marginTop: 16 }}>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {teaching.primer.map((card) => (
            <li className="file-card" key={card.title} style={{ marginBottom: 12 }}>
              <div className="file-card-head">
                <h4 style={{ margin: 0 }}>{card.title}</h4>
              </div>
              <p className="file-explanation" style={{ marginTop: 8 }}>
                {card.what}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
