"use client"

// The "New challenge of this type" action — R2 / FR-1 normative. Client
// Component island that calls the `regenerateChallengeAction` server action
// to re-invoke the bounded generation SDK call (#142) with
// `forceRegenerate: true`. On success the user is routed to the new
// challenge's Detail page; on failure a calm inline error appears next to
// the button — the current challenge stays fully visible (per #145's Page
// Spec §6c).
//
// When the current challenge has at least one attempt, the button shows a
// confirmation prompt before regenerating — `window.confirm` keeps the
// dependency surface minimal and works in the static HTML test runner. A
// fresh challenge with no attempts regenerates without a prompt.

import { useRouter } from "next/navigation"
import { useState } from "react"

import type { ChallengeType } from "@/lib/challenges"

import {
  IconAlert,
  IconLoader,
  IconRefresh,
} from "../../_components/chrome"
import { regenerateChallengeAction } from "../actions"

export function NewChallengeButton({
  owner,
  repo,
  type,
  hasAttempts,
}: {
  owner: string
  repo: string
  type: ChallengeType
  hasAttempts: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function regenerate() {
    if (busy) return
    if (hasAttempts) {
      const ok = typeof window !== "undefined" && window.confirm(
        "Generate a new challenge of this type? Your current attempts will " +
          "stay accessible by URL but won't appear on the new challenge.",
      )
      if (!ok) return
    }
    setBusy(true)
    setErrorMessage(null)
    const result = await regenerateChallengeAction({ owner, repo, type })
    if (result.ok) {
      router.push(
        `/repos/${owner}/${repo}/challenges/${result.challengeId}`,
      )
      router.refresh()
      return
    }
    setErrorMessage(result.error.message)
    setBusy(false)
  }

  return (
    <div className="inline-action" aria-busy={busy}>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => void regenerate()}
        disabled={busy}
      >
        {busy ? (
          <>
            <IconLoader size={14} /> Generating new challenge…
          </>
        ) : (
          <>
            <IconRefresh size={14} /> New challenge of this type
          </>
        )}
      </button>
      {errorMessage ? (
        <span
          className="inline-note"
          role="alert"
          aria-live="polite"
          style={{ marginLeft: 8 }}
        >
          <IconAlert size={14} /> Couldn&apos;t generate a new challenge.
          Try again. ({errorMessage})
        </span>
      ) : null}
    </div>
  )
}
