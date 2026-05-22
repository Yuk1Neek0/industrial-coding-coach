"use client"

// The PR picker — the Client Component island for `/reviews/[owner]/[repo]`
// (Diff Review page spec §4: "task #116 wires PR selection").
//
// It collects a pull request number for an imported repository, runs the
// bounded review call through the `createReviewAction` Server Action, and
// navigates to the new review on success. It never touches the Anthropic SDK
// or the GitHub client itself. Reviews already stored for the repo are listed
// above the form so the user can revisit them.

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import type { DiffReviewErrorKind, RepoIdentity, RepoReviewSummary } from "@/lib/diff-review"

import {
  GitHubMark,
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconHelp,
  IconKey,
  IconLoader,
  IconSparkles,
} from "../../../_components/chrome"
import { relTime } from "../../../_components/util"
import { createReviewAction } from "../actions"

type Status = "resting" | "in-progress" | "error"

interface ErrorCopy {
  icon: React.ReactNode
  title: string
  body: React.ReactNode
}

const ERROR_COPY: Record<DiffReviewErrorKind, ErrorCopy> = {
  "not-imported": {
    icon: <IconAlert size={18} />,
    title: "This repository isn't imported yet",
    body: "We need an imported snapshot before we can review a pull request on it. Import the repository first.",
  },
  "missing-api-key": {
    icon: <IconKey size={18} />,
    title: "AI review isn't configured",
    body: (
      <>
        The review runs through Anthropic&apos;s API. Set{" "}
        <span className="code-chip">ANTHROPIC_API_KEY</span> in your
        project&apos;s <span className="code-chip">.env</span> file (see{" "}
        <span className="code-chip">.env.example</span>) — keys are read
        server-side and never collected in the UI.
      </>
    ),
  },
  "missing-pr": {
    icon: <IconAlert size={18} />,
    title: "We couldn't find that pull request",
    body: "No pull request with that number exists on this repository. Check the number and try again.",
  },
  "github-failure": {
    icon: <IconAlert size={18} />,
    title: "Couldn't reach GitHub",
    body: (
      <>
        Fetching the pull request from GitHub failed. This can be a network
        issue, a rate limit, or a private repo — set{" "}
        <span className="code-chip">GITHUB_TOKEN</span> in your{" "}
        <span className="code-chip">.env</span> for the higher authenticated
        limit. Try again in a moment.
      </>
    ),
  },
  "empty-pr": {
    icon: <IconAlert size={18} />,
    title: "That pull request has no changed files",
    body: "There is nothing to review — the pull request changes no files. Pick another pull request.",
  },
  "llm-failure": {
    icon: <IconAlert size={18} />,
    title: "The review couldn't be generated",
    body: "The AI request failed partway through. This usually clears on retry; if it keeps happening, the API key may be rate-limited or temporarily unavailable.",
  },
  unknown: {
    icon: <IconAlert size={18} />,
    title: "Something went wrong",
    body: "Something unexpected happened while preparing the review. Try once more — if it keeps failing, restart the dev server.",
  },
}

/**
 * The PR picker for an imported repository.
 *
 * @param identity - the imported repo this picker reviews PRs on.
 * @param reviews - the diff reviews already stored against the repo.
 */
export function PrPicker({
  identity,
  reviews,
}: {
  identity: RepoIdentity
  reviews: RepoReviewSummary[]
}) {
  const router = useRouter()
  const [status, setStatus] = useState<Status>("resting")
  const [errorKind, setErrorKind] = useState<DiffReviewErrorKind | null>(null)
  const [prNumber, setPrNumber] = useState("")

  const busy = status === "in-progress"

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    const parsed = Number(prNumber)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setErrorKind("missing-pr")
      setStatus("error")
      return
    }
    setStatus("in-progress")
    setErrorKind(null)
    const result = await createReviewAction({
      owner: identity.owner,
      repo: identity.repo,
      prNumber: parsed,
    })
    if (result.ok) {
      // The review is persisted — navigate to its page.
      router.push(`/reviews/r/${result.reviewId}`)
    } else {
      setErrorKind(result.error.kind)
      setStatus("error")
    }
  }

  return (
    <>
      {reviews.length > 0 && (
        <ul className="repo-list" aria-label="Reviews on this repository">
          {reviews.map((r) => (
            <li key={r.id}>
              <Link className="repo-row" href={`/reviews/r/${r.id}`}>
                <span className="repo-icon" aria-hidden="true">
                  <IconHelp size={20} />
                </span>
                <div>
                  <div className="repo-name">Pull request #{r.prNumber}</div>
                  <div className="repo-meta">
                    <span className="repo-state mono">
                      reviewed {relTime(r.createdAt)}
                    </span>
                    <span className={`repo-state ${r.graded ? "has" : "no"}`}>
                      {r.graded ? `graded · ${r.score}/100` : "not answered yet"}
                    </span>
                  </div>
                </div>
                <span className="repo-cta" aria-hidden="true">
                  <IconArrowRight size={16} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form className="pr-form" onSubmit={(e) => void submit(e)}>
        <div className="pr-form-head">
          <IconSparkles size={16} />
          <h2>Review a pull request</h2>
        </div>
        <p className="pr-form-desc">
          Enter the number of a pull request on{" "}
          <span className="code-chip">
            {identity.owner}/{identity.repo}
          </span>
          . We&apos;ll fetch its diff from GitHub and write a plain-language
          review — what each file changed, the risks, and a comprehension check.
        </p>
        <div className="pr-form-row">
          <div className="pr-field">
            <label htmlFor="pr-number">Pull request number</label>
            <input
              id="pr-number"
              className="pr-input"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="e.g. 42"
              value={prNumber}
              onChange={(e) => setPrNumber(e.target.value)}
              disabled={busy}
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={busy || prNumber.trim() === ""}
          >
            {busy ? (
              <>
                <IconLoader size={14} /> Reviewing…
              </>
            ) : (
              <>
                <IconSparkles size={14} /> Review this PR
              </>
            )}
          </button>
        </div>

        {busy && (
          <section
            className="status-region"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="status-card">
              <div className="status-head">
                <div className="status-icon busy" aria-hidden="true">
                  <IconLoader size={18} />
                </div>
                <h2 className="status-title">
                  Reviewing pull request #{prNumber}…
                </h2>
              </div>
              <p className="status-body">
                Fetching the diff from GitHub and writing the review. This
                usually takes 10–40 seconds.
              </p>
              <div
                className="progress"
                role="progressbar"
                aria-label="Reviewing pull request"
              >
                <div className="progress-bar" />
              </div>
              <div className="progress-label">
                <IconLoader size={13} /> Reading the changed files and grounding
                every explanation in the real diff
              </div>
            </div>
          </section>
        )}

        {status === "error" && errorKind && (
          <section className="status-region" aria-live="polite" role="alert">
            <div className="status-card" data-error="true">
              <div className="status-head">
                <div className="status-icon error" aria-hidden="true">
                  {ERROR_COPY[errorKind].icon}
                </div>
                <h2 className="status-title">{ERROR_COPY[errorKind].title}</h2>
              </div>
              <p className="status-body">{ERROR_COPY[errorKind].body}</p>
              <div className="status-actions">
                {errorKind === "not-imported" ? (
                  <Link className="btn btn-primary" href="/import">
                    <GitHubMark size={14} /> Import this repository
                  </Link>
                ) : (
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={busy}
                  >
                    <IconCheck size={14} /> Try again
                  </button>
                )}
                <Link className="btn btn-ghost" href="/reviews">
                  Browse other repos
                </Link>
              </div>
            </div>
          </section>
        )}
      </form>
    </>
  )
}
