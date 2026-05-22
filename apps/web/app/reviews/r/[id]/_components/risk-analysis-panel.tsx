// The Risk Analysis Panel — one of the four M8 UI pieces (spec:
// docs/design/risk-analysis-panel.md), embedded as the "Risks to watch"
// section of the Diff Review page (§6d).
//
// A Server Component — it renders already-loaded data with no interactivity.
// It renders `DiffReview.risks` (the schema's `DiffRisk` shape: title + detail
// — the merged code is authoritative; the spec's richer severity/category
// fields are not in the persisted shape). Plainly visible, never collapsed.

import type { RiskView } from "@/lib/diff-review"

import { IconAlert, IconShield } from "../../../_components/chrome"

/**
 * The Risk Analysis Panel.
 *
 * @param risks - the risks the review call produced; may be empty.
 */
export function RiskAnalysisPanel({ risks }: { risks: RiskView[] }) {
  return (
    <section className="review-section" aria-labelledby="sec-risks">
      <div className="review-section-head">
        <h2 id="sec-risks">Risks to watch</h2>
        <span className="hint">
          {risks.length > 0
            ? `${risks.length} risk${risks.length === 1 ? "" : "s"} this change may introduce`
            : "bugs and risks this change may introduce"}
        </span>
      </div>

      {risks.length > 0 ? (
        <ul className="risk-list">
          {risks.map((risk, i) => (
            <li className="risk-row" key={`${risk.title}-${i}`}>
              <h3>
                <span className="risk-icon" aria-hidden="true">
                  <IconAlert size={15} />
                </span>
                {risk.title}
              </h3>
              <p className="risk-detail">{risk.detail}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="inline-note">
          <IconShield size={15} />
          No notable risks were flagged for this change. Still read the changed
          files and the core-logic explanation above.
        </p>
      )}
    </section>
  )
}
