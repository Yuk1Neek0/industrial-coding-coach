"use client"

// Client Component island for the Challenge List Page's "Open this type"
// action when the type has no cached row yet (#144 / #148 R2 normative).
// Invoking it calls the `generateForTypeAction` server action, which runs
// the bounded generation SDK call (#142) server-side; on success the user is
// routed to the new challenge's Detail Page.

import { useRouter } from "next/navigation"
import { useState } from "react"

import { generateForTypeAction } from "../actions"
import { IconAlert, IconArrowRight, IconLoader } from "./chrome"

import type { ChallengeType } from "@/lib/challenges"

/**
 * A button rendered inline on a Challenge List row for an "applicable, not
 * yet generated" type. Clicking issues the bounded generation call server-
 * side and routes to the new Detail Page on success.
 */
export function ChallengeListGenerateButton({
  owner,
  repo,
  type,
}: {
  owner: string
  repo: string
  type: ChallengeType
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function onClick() {
    if (busy) return
    setBusy(true)
    setErrorMessage(null)
    const result = await generateForTypeAction({ owner, repo, type })
    if (result.ok) {
      router.push(
        `/repos/${owner}/${repo}/challenges/${result.challengeId}`,
      )
      // Keep `busy` true while navigating — the user sees the spinner until
      // the new page renders, so the click feels intentional.
      return
    }
    setErrorMessage(result.error.message)
    setBusy(false)
  }

  return (
    <div className="inline-action" aria-busy={busy}>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void onClick()}
        disabled={busy}
      >
        {busy ? (
          <>
            <IconLoader size={14} /> Generating…
          </>
        ) : (
          <>
            Generate this challenge <IconArrowRight size={14} />
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
          <IconAlert size={14} /> {errorMessage}
        </span>
      ) : null}
    </div>
  )
}
