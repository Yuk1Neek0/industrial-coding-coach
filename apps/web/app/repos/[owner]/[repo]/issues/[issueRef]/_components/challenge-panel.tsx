// The Challenge Panel — one of the four M7 UI pieces (spec:
// docs/design/challenge-panel.page-spec.md), embedded as the "Challenge"
// section of the Issue Learning Workspace page (§6h).
//
// FR-7 + R3 normative — this panel is a stub. It renders `challengeConcept`
// and `challengeType` read-only with an explicit "deferred to Milestone 9"
// message. It does NOT run, grade, or claim to resolve a challenge — there
// is no input, no submit button, no scoring, no persistence. Adding any of
// those would imply M9 functionality exists today; that is exactly what R3
// forbids.

import { AiLabel, Badge, IconBeaker, IconLock } from "../../../../../_components/chrome"

interface ChallengePanelProps {
  challengeConcept: string | null
  challengeType: string | null
}

export function ChallengePanel({
  challengeConcept,
  challengeType,
}: ChallengePanelProps) {
  return (
    <section className="unit-section" aria-labelledby="sec-challenge">
      <div className="unit-section-head">
        <h2 id="sec-challenge">Challenge</h2>
        <AiLabel>AI-generated stub · M9 preview</AiLabel>
      </div>
      <p className="unit-prose" style={{ fontSize: 14 }}>
        A debug or expand exercise that would deepen your grasp of{" "}
        <em>this</em> issue&apos;s code. The runnable challenge lives in
        Milestone 9 — this panel is a preview of the concept.
      </p>
      <div className="challenge-panel">
        <div className="challenge-panel-head">
          <IconBeaker size={12} />
          <span>Challenge preview</span>
          {challengeType && (
            <Badge tone="info">
              {challengeType}
            </Badge>
          )}
        </div>
        {challengeConcept ? (
          <p className="unit-prose" style={{ fontSize: 14 }}>
            {challengeConcept}
          </p>
        ) : (
          <p className="unit-prose" style={{ fontSize: 14, color: "var(--fg-subtle)" }}>
            No challenge concept was generated for this unit.
          </p>
        )}
        <div className="challenge-deferred" role="note">
          <strong style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <IconLock size={13} />
            Deferred to Milestone 9
          </strong>
          <div style={{ marginTop: 4 }}>
            Running and grading challenges is part of the Debug &amp;
            Expansion Challenges milestone (M9). When M9 lands, this panel
            will host the runnable challenge for this issue.
          </div>
        </div>
      </div>
    </section>
  )
}
