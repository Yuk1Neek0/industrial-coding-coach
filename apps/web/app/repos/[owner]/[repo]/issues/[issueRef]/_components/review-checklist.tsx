"use client"

// The Review Checklist UI — one of the four M7 UI pieces (spec:
// docs/design/review-checklist.page-spec.md), embedded as the "Review
// checklist" section of the Issue Learning Workspace page (§6e).
//
// Each toggle posts through the `toggleChecklistItemAction` Server Action;
// the M7 data-access layer (#135) writes the JSON `checklist_state` column.
// R4 normative — the progress counter is display-only; this component never
// gates the Understanding Questions form or the score.

import { useState, useTransition } from "react"

import type {
  ChecklistStateMap,
  LearningUnitView,
} from "@/lib/learning-units"

import { AiLabel, IconAlert } from "../../../../../_components/chrome"
import { toggleChecklistItemAction } from "../actions"

interface ReviewChecklistProps {
  unitId: number
  reviewChecklist: LearningUnitView["reviewChecklist"]
  initialState: ChecklistStateMap
}

export function ReviewChecklist({
  unitId,
  reviewChecklist,
  initialState,
}: ReviewChecklistProps) {
  const [state, setState] = useState<ChecklistStateMap>(initialState)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  if (reviewChecklist.length === 0) {
    return (
      <section
        className="unit-section"
        aria-labelledby="sec-checklist"
      >
        <div className="unit-section-head">
          <h2 id="sec-checklist">Review checklist</h2>
        </div>
        <p className="inline-note">
          <IconAlert size={15} />
          No review-checklist items were generated for this unit.
        </p>
      </section>
    )
  }

  const checkedCount = reviewChecklist.filter(
    (item) => state[item.id] === true,
  ).length

  async function onToggle(itemId: string, nextChecked: boolean) {
    // Optimistic update — the toggle is non-blocking by design.
    setState((prev) => ({ ...prev, [itemId]: nextChecked }))
    setError(null)
    startTransition(async () => {
      const res = await toggleChecklistItemAction({
        unitId,
        itemId,
        checked: nextChecked,
      })
      if (!res.ok) {
        // Revert on failure so the visible state matches the persisted state.
        setState((prev) => ({ ...prev, [itemId]: !nextChecked }))
        setError(res.error.message)
      } else {
        setState(res.checklistState)
      }
    })
  }

  return (
    <section className="unit-section" aria-labelledby="sec-checklist">
      <div className="unit-section-head">
        <h2 id="sec-checklist">Review checklist</h2>
        <AiLabel>AI-generated coaching guidance</AiLabel>
      </div>
      <p className="unit-prose" style={{ fontSize: 14 }}>
        Verify the AI&apos;s output against these checks — tied to the files
        this issue touches.{" "}
        <strong>
          Ticking items tracks your progress; it does not change your
          understanding-question score.
        </strong>
      </p>
      <p className="checklist-progress">
        Checked {checkedCount} of {reviewChecklist.length}
      </p>
      <ul className="unit-checklist" aria-label="Review checklist items">
        {reviewChecklist.map((item) => {
          const checked = state[item.id] === true
          const inputId = `checklist-${item.id}`
          return (
            <li key={item.id} className="unit-checklist-item">
              <div className="checklist-row">
                <input
                  id={inputId}
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => void onToggle(item.id, e.target.checked)}
                  aria-describedby={`${inputId}-text`}
                />
                <label htmlFor={inputId} className="checklist-text" id={`${inputId}-text`}>
                  {item.description}
                </label>
              </div>
            </li>
          )
        })}
      </ul>
      {error && (
        <p className="inline-note inline-warn" style={{ marginTop: 12 }}>
          <IconAlert size={15} />
          Couldn&apos;t save your last change — {error}. Try toggling again.
        </p>
      )}
    </section>
  )
}
