"use client"

// Client component island for the M10 Portfolio Page's two export actions
// (Page Spec §8). Each button kicks off a `fetch` against the route's
// `api/export-markdown` / `api/export-pdf` Route Handler and triggers a
// browser download from the streamed `Response`.
//
// Why Route Handlers (not Server Actions): Next.js Server Actions return a
// JSON-ish payload, not a streamable binary body, so a clean
// `Content-Disposition: attachment` download is fiddly. Route Handlers
// natively return a `Response` with the right headers — see the
// integration notes for the decision record.

import { useState, useTransition } from "react"

import { IconDownload, IconLoader } from "./chrome"

interface ExportButtonsProps {
  owner: string
  repo: string
  /** Disabled while `getMemory` returned `null` — nothing to export yet. */
  disabled?: boolean
}

/** The two export buttons (markdown ZIP + PDF). */
export function ExportButtons({ owner, repo, disabled }: ExportButtonsProps) {
  return (
    <div className="export-buttons" style={{ display: "inline-flex", gap: 8 }}>
      <ExportButton
        owner={owner}
        repo={repo}
        kind="markdown"
        label="Export bundle (.zip)"
        disabled={disabled}
      />
      <ExportButton
        owner={owner}
        repo={repo}
        kind="pdf"
        label="Export PDF"
        disabled={disabled}
      />
    </div>
  )
}

interface ExportButtonProps extends ExportButtonsProps {
  kind: "markdown" | "pdf"
  label: string
}

function ExportButton({ owner, repo, kind, label, disabled }: ExportButtonProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onClick() {
    setError(null)
    startTransition(async () => {
      try {
        const url =
          kind === "markdown"
            ? `/portfolio/${owner}/${repo}/api/export-markdown`
            : `/portfolio/${owner}/${repo}/api/export-pdf`
        const res = await fetch(url, { method: "POST" })
        if (!res.ok) {
          const body = await res.text().catch(() => "")
          setError(
            body || "Couldn't build the export. Try again.",
          )
          return
        }
        const blob = await res.blob()
        const filename = filenameFromContentDisposition(
          res.headers.get("content-disposition"),
        )
        triggerDownload(blob, filename)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't build the export. Try again.",
        )
      }
    })
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={onClick}
        disabled={disabled || pending}
        aria-busy={pending}
      >
        {pending ? <IconLoader size={14} /> : <IconDownload size={14} />}{" "}
        {pending ? "Building…" : label}
      </button>
      {error && (
        <span
          className="hint"
          role="alert"
          style={{ color: "var(--danger, #b13030)" }}
        >
          {error}
        </span>
      )}
    </span>
  )
}

/**
 * Pull the filename out of a `Content-Disposition: attachment; filename="..."`
 * header — used to name the downloaded file. Falls back to a sane default
 * when the header is missing.
 */
function filenameFromContentDisposition(header: string | null): string {
  if (!header) return "portfolio"
  const match =
    /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header) ?? null
  if (match && match[1]) return decodeURIComponent(match[1])
  return "portfolio"
}

/** Trigger a browser download for a Blob via a transient `<a download>`. */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
