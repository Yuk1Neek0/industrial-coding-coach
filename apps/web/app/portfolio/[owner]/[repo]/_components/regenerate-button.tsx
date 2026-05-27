"use client"

// Client component island for the M10 Portfolio Page's "Regenerate memory"
// action (Page Spec §8). Wraps the `regenerateMemoryAction` Server Action
// with `useTransition` so the rest of the page stays interactive while the
// bounded SDK calls run. Surfaces typed errors (missing-api-key,
// integrity-failure, length-violation, verb-violation, llm-failure)
// inline next to the button without leaking a raw stack trace.

import { useState, useTransition } from "react"

import { regenerateMemoryAction } from "../actions"
import type { RegenerateMemoryError } from "@/lib/portfolio"

import { IconLoader, IconRefresh } from "./chrome"

interface RegenerateButtonProps {
  snapshotId: number
  /** When `true`, this is the first-open inline button — no confirmation. */
  variant?: "primary" | "secondary" | "first-open"
  /** Optional custom label; defaults to "Regenerate memory". */
  label?: string
}

/**
 * Regenerate-memory button. Uses `useTransition` so the loading spinner
 * shows without the action being a server-event boundary the user has to
 * wait through (Page Spec §8 — "the rest of the page stays visible and
 * readable").
 *
 * The confirmation `AlertDialog` from the Page Spec is **deferred** — see
 * the integration notes for the rationale. The button still shows a clear
 * label, a spinner while pending, and an inline error region for failures.
 */
export function RegenerateButton({
  snapshotId,
  variant = "primary",
  label = "Regenerate memory",
}: RegenerateButtonProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<RegenerateMemoryError | null>(null)

  function onClick() {
    setError(null)
    startTransition(async () => {
      const result = await regenerateMemoryAction({ snapshotId })
      if (!result.ok) setError(result.error)
    })
  }

  const btnClass =
    variant === "secondary"
      ? "btn btn-ghost"
      : variant === "first-open"
      ? "btn btn-primary"
      : "btn btn-primary"

  return (
    <div className="regenerate-island">
      <button
        type="button"
        className={btnClass}
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? <IconLoader size={14} /> : <IconRefresh size={14} />}{" "}
        {pending ? "Regenerating…" : label}
      </button>
      <span
        className="hint"
        role="status"
        aria-live="polite"
        style={{ marginLeft: 8 }}
      >
        {pending ? "Regenerating your learning memory…" : null}
      </span>
      {error && (
        <p
          className="hint"
          role="alert"
          style={{ marginTop: 8, color: "var(--danger, #b13030)" }}
        >
          {error.message}
        </p>
      )}
    </div>
  )
}
