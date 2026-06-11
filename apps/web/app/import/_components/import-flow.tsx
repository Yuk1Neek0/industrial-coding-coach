"use client"

// The interactive import flow — the page's Client Component island (page spec
// §4/§7). It owns the form state and the status/result region, parses the URL
// client-side before any call, runs the import via the `importRepoAction`
// Server Action, and renders the idle / in-progress / success / error states.

import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
} from "lucide-react"
import Link from "next/link"
import { useId, useState } from "react"

import type { ImportErrorView, ImportSuccessView } from "@/lib/github-import"
import { parseGitHubRepoUrl } from "@/lib/github-url"

import { importRepoAction } from "../actions"
import { Badge, GitHubMark } from "./chrome"

type Status = "idle" | "in-progress" | "success" | "error"

/** The repo identity shown in the in-progress heading. */
interface PendingImport {
  ownerRepo: string
  ref: string
}

/** Curated heading + explanation copy for each error kind (page spec §11). */
const ERROR_COPY: Record<
  ImportErrorView["kind"],
  { title: string; body: React.ReactNode }
> = {
  "invalid-url": {
    title: "That doesn't look like a GitHub repository URL",
    body: (
      <>
        We couldn&apos;t read that value as a GitHub repository address. Make
        sure it looks like{" "}
        <span className="code-chip">https://github.com/owner/repo</span>.
      </>
    ),
  },
  "not-found": {
    title: "Repository not found",
    body: (
      <>
        GitHub has no repository at that address — or it is private and the
        configured token can&apos;t see it. Check the spelling, and for a
        private repo confirm a token with access is set as{" "}
        <span className="code-chip">GITHUB_TOKEN</span> in{" "}
        <span className="code-chip">.env</span>.
      </>
    ),
  },
  "rate-limited": {
    title: "GitHub rate limit reached",
    body: (
      <>
        We&apos;ve hit GitHub&apos;s request limit for now. Configure a personal
        access token as <span className="code-chip">GITHUB_TOKEN</span> in{" "}
        <span className="code-chip">.env</span> for a much higher limit, or wait
        a few minutes and retry.
      </>
    ),
  },
  "auth-failure": {
    title: "GitHub authentication failed",
    body: (
      <>
        The configured GitHub token is missing, invalid, or doesn&apos;t have
        permission to read that repository. Add a token with read-only repo
        scope as <span className="code-chip">GITHUB_TOKEN</span> in your
        project&apos;s <span className="code-chip">.env</span> file. We never ask
        for tokens here.
      </>
    ),
  },
  unknown: {
    title: "Import failed",
    body: "GitHub didn't respond — it may be temporarily unavailable, or your network is offline. Your inputs are kept so you can retry without re-typing.",
  },
}

/** Human-readable byte size, e.g. `4.1 KB`. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(/\.0$/, "")} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** Readable local time for an ISO timestamp. */
function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** The import form + status/result region. */
export function ImportFlow() {
  const [url, setUrl] = useState("")
  const [gitRef, setGitRef] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [result, setResult] = useState<ImportSuccessView | null>(null)
  const [error, setError] = useState<ImportErrorView | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)

  const urlId = useId()
  const refInputId = useId()
  const urlHintId = useId()
  const urlErrorId = useId()

  const busy = status === "in-progress"
  const urlInvalid = status === "error" && error?.kind === "invalid-url"

  async function runImport(targetUrl: string, targetRef: string) {
    // Parse client-side first: an unparseable URL is the `invalid-url` error
    // state with no network round-trip (page spec §7).
    const parsed = parseGitHubRepoUrl(targetUrl)
    if (!parsed) {
      setResult(null)
      setPending(null)
      setError({ kind: "invalid-url", message: "" })
      setStatus("error")
      return
    }

    const trimmedRef = targetRef.trim()
    setPending({ ownerRepo: `${parsed.owner}/${parsed.repo}`, ref: trimmedRef })
    setError(null)
    setResult(null)
    setStatus("in-progress")

    const res = await importRepoAction({
      owner: parsed.owner,
      repo: parsed.repo,
      ...(trimmedRef ? { ref: trimmedRef } : {}),
    })

    if (res.ok) {
      setResult(res.result)
      setStatus("success")
    } else {
      setError(res.error)
      setStatus("error")
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!url.trim() || busy) return
    void runImport(url, gitRef)
  }

  function resetToIdle() {
    setUrl("")
    setGitRef("")
    setResult(null)
    setError(null)
    setPending(null)
    setStatus("idle")
  }

  return (
    <>
      <form className="import-card" onSubmit={onSubmit} noValidate>
        <h2 className="sr-only">Import form</h2>

        <div className="form-field">
          <label className="form-label" htmlFor={urlId}>
            Repository URL
          </label>
          <div
            className="form-input"
            data-invalid={urlInvalid ? "true" : "false"}
          >
            <span className="icon" aria-hidden="true">
              <GitHubMark size={16} />
            </span>
            <input
              id={urlId}
              type="text"
              inputMode="url"
              placeholder="https://github.com/owner/repo"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={busy}
              required
              aria-invalid={urlInvalid}
              aria-describedby={urlInvalid ? urlErrorId : urlHintId}
            />
          </div>
          {urlInvalid ? (
            <div id={urlErrorId} className="form-error">
              <AlertTriangle size={13} aria-hidden="true" />
              Expected a URL like https://github.com/owner/repo
            </div>
          ) : (
            <div id={urlHintId} className="form-hint">
              Paste the full GitHub URL — e.g.{" "}
              <span className="code-chip">https://github.com/owner/repo</span>
            </div>
          )}
        </div>

        <div className="form-field">
          <label className="form-label" htmlFor={refInputId}>
            Branch / tag <span className="optional">optional</span>
          </label>
          <div className="form-input no-icon">
            <input
              id={refInputId}
              type="text"
              placeholder="Branch or tag (optional) — defaults to the repo's default branch"
              value={gitRef}
              onChange={(event) => setGitRef(event.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="form-row">
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={!url.trim() || busy}
          >
            {busy && <Loader2 size={14} className="spin" aria-hidden="true" />}
            {busy ? "Importing…" : "Import"}
          </button>
        </div>

        <p className="form-hint" style={{ marginTop: 14 }}>
          Importing a private repository? A GitHub token must be configured as{" "}
          <span className="code-chip">GITHUB_TOKEN</span> in the project&apos;s{" "}
          <span className="code-chip">.env</span> file.
        </p>
      </form>

      <section className="status-region" aria-live="polite" aria-busy={busy}>
        {status === "in-progress" && pending && (
          <InProgress pending={pending} />
        )}
        {status === "success" && result && (
          <SuccessView result={result} onImportAnother={resetToIdle} />
        )}
        {status === "error" && error && (
          <ErrorView
            error={error}
            onTryAgain={
              error.kind === "invalid-url"
                ? undefined
                : () => void runImport(url, gitRef)
            }
          />
        )}
      </section>
    </>
  )
}

/** In-progress state — an indeterminate progress bar and reassurance copy. */
function InProgress({ pending }: { pending: PendingImport }) {
  return (
    <div className="status-card">
      <div className="status-head">
        <div className="status-icon busy" aria-hidden="true">
          <Loader2 size={18} className="spin" />
        </div>
        <h2 className="status-title">Importing {pending.ownerRepo}…</h2>
      </div>
      <p className="status-body">
        Fetching the file tree and key files from GitHub
        {pending.ref ? (
          <>
            {" "}
            on the <span className="code-chip">{pending.ref}</span> ref
          </>
        ) : null}
        . This usually takes a few seconds.
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-label="Import in progress"
      >
        <div className="progress-bar" />
      </div>
      <div className="progress-label">
        <Loader2 size={13} className="spin" aria-hidden="true" />
        Reading the repository tree
      </div>
    </div>
  )
}

/**
 * Success result view — the imported snapshot summary and captured files,
 * with forward links into the snapshot file viewer (`/repos/[owner]/[repo]/
 * files`, URL contract per the viewer page spec §4a: repo-relative `?path=`
 * encoded whole with `encodeURIComponent`, no `?ref=` — the viewer always
 * shows the most recent snapshot).
 */
function SuccessView({
  result,
  onImportAnother,
}: {
  result: ImportSuccessView
  onImportAnother: () => void
}) {
  const refIsDefault = result.ref === result.defaultBranch
  const filesHref = `/repos/${result.owner}/${result.repo}/files`
  return (
    <div className="status-card">
      <div className="status-head">
        <div className="status-icon success" aria-hidden="true">
          <CheckCircle2 size={18} />
        </div>
        <div>
          <h2 className="status-title">
            {result.isReimport ? "Snapshot refreshed" : "Repository imported"}
          </h2>
          <div className="status-timestamp mono">
            {formatTime(result.importedAt)}
          </div>
        </div>
      </div>

      <div className="summary-row">
        <div className="summary-label">Repository</div>
        <div className="summary-value summary-repo">
          <GitHubMark size={14} />
          <span className="mono">
            {result.owner}/{result.repo}
          </span>
          <Badge soft mono>
            {result.ref}
            {refIsDefault ? " · default" : ""}
          </Badge>
        </div>
      </div>
      <div className="summary-row">
        <div className="summary-label">File tree</div>
        <div className="summary-value mono">
          {result.fileCount.toLocaleString()} files
        </div>
      </div>
      <div className="summary-row">
        <div className="summary-label">Key files captured</div>
        <div className="summary-value mono">{result.keyFiles.length}</div>
      </div>

      <h3 className="captured-title">Captured files</h3>
      {result.keyFiles.length > 0 ? (
        <ul className="keyfiles">
          {result.keyFiles.map((file) => (
            <li className="keyfile" key={file.path}>
              <span className="keyfile-icon" aria-hidden="true">
                <FileText size={14} />
              </span>
              <Link
                className="keyfile-path keyfile-link"
                href={`${filesHref}?path=${encodeURIComponent(file.path)}`}
              >
                {file.path}
              </Link>
              <span className="keyfile-size">{formatBytes(file.bytes)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="status-body">
          No key files were captured — the repository may not contain a
          manifest, lockfile, config, README, or CI workflow.
        </p>
      )}

      <div className="status-actions">
        <Link className="btn btn-primary btn-lg" href={filesHref}>
          <FolderOpen size={14} aria-hidden="true" />
          Browse the snapshot
        </Link>
        <button type="button" className="btn btn-lg" onClick={onImportAnother}>
          <RefreshCw size={14} aria-hidden="true" />
          Import another repository
        </button>
      </div>
    </div>
  )
}

/** Error state — curated per-kind copy and a recovery action. */
function ErrorView({
  error,
  onTryAgain,
}: {
  error: ImportErrorView
  onTryAgain?: () => void
}) {
  const copy = ERROR_COPY[error.kind]
  return (
    <div className="status-card" data-error-kind={error.kind}>
      <div className="status-head">
        <div className="status-icon error" aria-hidden="true">
          <AlertTriangle size={18} />
        </div>
        <h2 className="status-title">{copy.title}</h2>
      </div>
      <p className="status-body">{copy.body}</p>
      {onTryAgain ? (
        <div className="status-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onTryAgain}
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  )
}
