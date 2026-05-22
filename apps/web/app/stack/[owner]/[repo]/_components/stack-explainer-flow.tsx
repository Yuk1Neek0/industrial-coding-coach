"use client"

// The interactive Stack Explanation flow — the page's Client Component island
// (page spec §5). It owns the trigger interaction and the status/result
// region: resting → in-progress → explained, plus the in-page error states.
// It runs the explanation via the `explainStackAction` Server Action and never
// touches the Anthropic SDK itself.

import Link from "next/link"
import { useState } from "react"

import type {
  RepoIdentity,
  StackErrorKind,
  StackExplanationView,
} from "@/lib/stack-explainer"

import {
  GitHubMark,
  IconAlert,
  IconArrowRight,
  IconBox,
  IconBriefcase,
  IconBug,
  IconCheck,
  IconFileCode,
  IconKey,
  IconLoader,
  IconShuffle,
  IconSlash,
  IconSparkles,
} from "../../../_components/chrome"
import { relTime, slugify } from "../../../_components/util"
import { explainStackAction } from "../actions"

type Status = "resting" | "in-progress" | "explained" | "error"

type Tool = StackExplanationView["tools"][number]

/* ── Inline code highlighting ─────────────────────────────────────── */

const CODE_TOKEN =
  /([\w./\-@[\]]+\.(?:tsx?|jsx?|css|json|mjs|mdx?|html|sql|toml|ya?ml)|apps\/[\w./-]+|packages\/[\w./-]+|`[^`]+`)/g

/** Wrap file-path / backtick tokens in a purpose string as <code> spans. */
function renderInlineCode(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(CODE_TOKEN)) {
    const index = match.index ?? 0
    if (index > last) parts.push(text.slice(last, index))
    let token = match[0]
    if (token.startsWith("`") && token.endsWith("`")) token = token.slice(1, -1)
    parts.push(<code key={parts.length}>{token}</code>)
    last = index + match[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length > 0 ? parts : text
}

/* ── Stack Decision Map ───────────────────────────────────────────── */

function StackDecisionMap({ tools }: { tools: Tool[] }) {
  if (tools.length === 0) {
    return (
      <p className="inline-empty">
        <IconBox size={13} /> No major tools were identified for this project.
      </p>
    )
  }
  return (
    <ul className="tool-grid">
      {tools.map((t) => (
        <li key={t.name}>
          <article className="tool-card" aria-labelledby={`tool-${slugify(t.name)}`}>
            <div className="tool-head">
              <h3 id={`tool-${slugify(t.name)}`} className="tool-name">
                {t.name}
              </h3>
            </div>
            <p className="tool-purpose">{renderInlineCode(t.purpose)}</p>
            <div className="tool-job">
              <span className="tool-job-icon" aria-hidden="true">
                <IconBriefcase size={18} />
              </span>
              <div>
                <div className="tool-job-label">Why it matters for jobs</div>
                <div className="tool-job-text">{t.jobRelevance}</div>
              </div>
            </div>
            {t.alternatives.length > 0 && (
              <div className="tool-foot">
                <a className="alt-link" href={`#alt-${slugify(t.name)}`}>
                  See alternatives <IconArrowRight size={12} />
                </a>
              </div>
            )}
          </article>
        </li>
      ))}
    </ul>
  )
}

/* ── Alternatives Comparison ──────────────────────────────────────── */

function AlternativesComparison({ tools }: { tools: Tool[] }) {
  const withAlts = tools.filter((t) => t.alternatives.length > 0)
  if (withAlts.length === 0) {
    return (
      <p className="inline-empty">
        <IconShuffle size={13} /> No alternatives were recorded for this stack.
      </p>
    )
  }
  return (
    <div>
      {withAlts.map((t) => (
        <section
          className="alt-group"
          key={t.name}
          aria-labelledby={`alt-${slugify(t.name)}`}
        >
          <div className="alt-group-head">
            <h3 id={`alt-${slugify(t.name)}`}>{t.name}</h3>
            <span className="alt-count">
              {t.alternatives.length} alternative
              {t.alternatives.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="alt-comparison">
            {t.alternatives.map((a) => (
              <li key={a.name}>
                <article className="alt-pair">
                  <div className="alt-pair-head">
                    <IconShuffle size={13} />
                    <span>Alternative</span>
                  </div>
                  <div className="alt-pair-name">{a.name}</div>
                  <div>
                    <div className="alt-pair-tradeoff-label">
                      What would change in this project
                    </div>
                    <div
                      className="alt-pair-tradeoff"
                      style={{ marginTop: 4 }}
                    >
                      {a.tradeOff}
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/* ── Key files & debug lists ──────────────────────────────────────── */

function KeyFilesList({
  items,
}: {
  items: StackExplanationView["keyFiles"]
}) {
  return (
    <ul className="fileref-list">
      {items.map((f, i) => (
        <li className="fileref" key={`${f.path}-${i}`}>
          <span className="fileref-icon" aria-hidden="true">
            <IconFileCode size={14} />
          </span>
          <code className="fileref-path">{f.path}</code>
          <p className="fileref-reason">{f.reason}</p>
        </li>
      ))}
    </ul>
  )
}

function DebugList({
  items,
}: {
  items: StackExplanationView["debugEntryPoints"]
}) {
  return (
    <ul className="fileref-list">
      {items.map((d, i) => (
        <li className="fileref" key={`${d.location}-${i}`}>
          <span className="fileref-icon" aria-hidden="true">
            <IconBug size={14} />
          </span>
          <code className="fileref-path">{d.location}</code>
          <p className="fileref-reason">{d.guidance}</p>
        </li>
      ))}
    </ul>
  )
}

/* ── Explained result ─────────────────────────────────────────────── */

function ExplainedView({
  explanation,
  busy,
  onReexplain,
}: {
  explanation: StackExplanationView
  busy: boolean
  onReexplain: () => void
}) {
  return (
    <>
      <div className="stack-trigger quiet">
        <span className="quiet-text">
          <IconCheck size={13} /> Explained {relTime(explanation.updatedAt)} ·{" "}
          {explanation.tools.length} tool
          {explanation.tools.length === 1 ? "" : "s"} identified
        </span>
        <span style={{ marginLeft: "auto" }}>
          <button type="button" className="btn" onClick={onReexplain} disabled={busy}>
            <IconSparkles size={13} /> Re-explain
          </button>
        </span>
      </div>

      <section className="stack-section" aria-labelledby="sec-map">
        <div className="stack-section-head">
          <h2 id="sec-map">Stack decision map</h2>
          <span className="hint">
            one tool at a time — what it does here, why it matters for jobs
          </span>
        </div>
        <StackDecisionMap tools={explanation.tools} />
      </section>

      <section className="stack-section" aria-labelledby="sec-alts">
        <div className="stack-section-head">
          <h2 id="sec-alts">Alternatives &amp; trade-offs</h2>
          <span className="hint">
            routes you could have taken — and what would change in this project
          </span>
        </div>
        <AlternativesComparison tools={explanation.tools} />
      </section>

      <section className="stack-section" aria-labelledby="sec-files">
        <div className="stack-section-head">
          <h2 id="sec-files">Key files to inspect</h2>
          <span className="hint">where to look first</span>
        </div>
        <KeyFilesList items={explanation.keyFiles} />
      </section>

      <section className="stack-section" aria-labelledby="sec-debug">
        <div className="stack-section-head">
          <h2 id="sec-debug">Where to start debugging</h2>
          <span className="hint">if something breaks, look here</span>
        </div>
        <DebugList items={explanation.debugEntryPoints} />
      </section>

      <footer className="stack-footer">
        owner/repo:{" "}
        <span className="val">
          {explanation.owner}/{explanation.repo}
        </span>
        <span className="sep">·</span>
        milestone 5 · stack explainer
      </footer>
    </>
  )
}

/* ── In-progress ──────────────────────────────────────────────────── */

function InProgressView({ identity }: { identity: RepoIdentity }) {
  return (
    <section className="status-region" aria-live="polite" aria-busy="true">
      <div className="status-card">
        <div className="status-head">
          <div className="status-icon busy" aria-hidden="true">
            <IconLoader size={18} />
          </div>
          <h2 className="status-title">
            Explaining the {identity.owner}/{identity.repo} stack…
          </h2>
        </div>
        <p className="status-body">
          Reading your project&apos;s files and writing the explanation. This
          usually takes 10–30 seconds.
        </p>
        <div
          className="progress"
          role="progressbar"
          aria-label="Explaining stack"
        >
          <div className="progress-bar" />
        </div>
        <div className="progress-label">
          <IconLoader size={13} />
          Inspecting package.json, config, and key dependencies
        </div>
      </div>
    </section>
  )
}

/* ── Error states ─────────────────────────────────────────────────── */

interface ErrorCopy {
  icon: React.ReactNode
  title: string
  body: React.ReactNode
}

const ERROR_COPY: Record<StackErrorKind, ErrorCopy> = {
  "not-imported": {
    icon: <IconSlash size={18} />,
    title: "This repository isn't imported yet",
    body: (
      <>
        We need an imported snapshot before we can read this project&apos;s
        files. Import it and we&apos;ll explain the stack right after.
      </>
    ),
  },
  "missing-api-key": {
    icon: <IconKey size={18} />,
    title: "AI explanation isn't configured",
    body: (
      <>
        The explanation runs through Anthropic&apos;s API. Set{" "}
        <span className="code-chip">ANTHROPIC_API_KEY</span> in your
        project&apos;s <span className="code-chip">.env</span> file (see{" "}
        <span className="code-chip">.env.example</span>) — keys are read
        server-side and never collected in the UI.
      </>
    ),
  },
  "unrecognized-stack": {
    icon: <IconAlert size={18} />,
    title: "We couldn't recognize this project's stack",
    body: "No major tools were detected when reading the project's package and config files. The repository might not be a JS/TS project, or its key files weren't imported — re-importing usually fixes this.",
  },
  "llm-failure": {
    icon: <IconAlert size={18} />,
    title: "The explanation couldn't be generated",
    body: "The AI request failed partway through. This usually clears on retry; if it keeps happening, the API key may be rate-limited or temporarily unavailable.",
  },
  unknown: {
    icon: <IconAlert size={18} />,
    title: "Something went wrong",
    body: "Something unexpected happened while preparing the explanation. Try once more — if it keeps failing, restart the dev server.",
  },
}

function ErrorView({
  kind,
  onTryAgain,
}: {
  kind: StackErrorKind
  onTryAgain: () => void
}) {
  const copy = ERROR_COPY[kind]
  return (
    <section className="status-region" aria-live="polite" role="alert">
      <div className="status-card" data-error="true">
        <div className="status-head">
          <div className="status-icon error" aria-hidden="true">
            {copy.icon}
          </div>
          <h2 className="status-title">{copy.title}</h2>
        </div>
        <p className="status-body">{copy.body}</p>
        <div className="status-actions">
          {kind === "not-imported" ? (
            <Link className="btn btn-primary" href="/import">
              <GitHubMark size={14} /> Import this repository
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onTryAgain}
            >
              <IconSparkles size={14} /> Try again
            </button>
          )}
          <Link className="btn btn-ghost" href="/stack">
            Browse other repos
          </Link>
        </div>
      </div>
    </section>
  )
}

/* ── Resting (not explained yet) ──────────────────────────────────── */

function RestingView({
  busy,
  onExplain,
}: {
  busy: boolean
  onExplain: () => void
}) {
  return (
    <section className="stack-trigger" aria-live="polite">
      <div className="stack-trigger-text">
        <strong>This stack hasn&apos;t been explained yet</strong>
        We&apos;ll read your project&apos;s files and explain why it uses each
        tool — in plain language, tied to the actual code.
      </div>
      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={onExplain}
        disabled={busy}
      >
        <IconSparkles size={14} />
        Explain this stack
      </button>
    </section>
  )
}

/* ── The flow ─────────────────────────────────────────────────────── */

/**
 * The trigger + status/result region for `/stack/[owner]/[repo]`.
 *
 * @param identity - the imported repo this page explains.
 * @param initialExplanation - a stored explanation rendered on load, or `null`
 *   when the repo has not been explained yet (the resting state).
 */
export function StackExplainerFlow({
  identity,
  initialExplanation,
}: {
  identity: RepoIdentity
  initialExplanation: StackExplanationView | null
}) {
  const [status, setStatus] = useState<Status>(
    initialExplanation ? "explained" : "resting",
  )
  const [explanation, setExplanation] = useState<StackExplanationView | null>(
    initialExplanation,
  )
  const [errorKind, setErrorKind] = useState<StackErrorKind | null>(null)

  const busy = status === "in-progress"

  async function runExplain() {
    if (busy) return
    setStatus("in-progress")
    setErrorKind(null)
    const result = await explainStackAction({
      owner: identity.owner,
      repo: identity.repo,
    })
    if (result.ok) {
      setExplanation(result.explanation)
      setStatus("explained")
    } else {
      setErrorKind(result.error.kind)
      setStatus("error")
    }
  }

  if (status === "in-progress") {
    return <InProgressView identity={identity} />
  }
  if (status === "error" && errorKind) {
    return <ErrorView kind={errorKind} onTryAgain={() => void runExplain()} />
  }
  if (status === "explained" && explanation) {
    return (
      <ExplainedView
        explanation={explanation}
        busy={busy}
        onReexplain={() => void runExplain()}
      />
    )
  }
  return <RestingView busy={busy} onExplain={() => void runExplain()} />
}
