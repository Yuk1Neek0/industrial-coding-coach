import { AppNav } from "./_components/chrome"

/**
 * Skeleton for the Challenge List Page while the server reads run
 * (`getApplicableChallenges`, `getLatestOutcome` per row, project-map read).
 * The data source is local SQLite — loading is brief, but the state must
 * exist so the page never flashes empty. The list view never shows an
 * LLM-in-progress state (R2 / FR-1).
 */
export default function ChallengeListLoading() {
  return (
    <div className="screen">
      <AppNav active="challenges" />
      <main className="page">
        <div className="container-narrow" aria-busy="true">
          <div
            className="page-eyebrow"
            style={{ marginTop: 24 }}
            aria-hidden="true"
          >
            <span className="dot" /> Challenges · M9
          </div>
          <div
            className="review-titlewrap"
            style={{ marginTop: 0 }}
            aria-hidden="true"
          >
            <h1 className="page-title" style={{ margin: 0 }}>
              Loading…
            </h1>
          </div>
          <p className="page-subtitle" style={{ marginTop: 16 }}>
            Reading cached challenges for this snapshot.
          </p>
          <ul className="file-list" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li className="file-card" key={i}>
                <div className="file-card-head">
                  <span className="file-path">Loading…</span>
                </div>
                <p className="file-explanation">Loading row…</p>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  )
}
