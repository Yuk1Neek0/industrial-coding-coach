import { AppNav } from "../_components/chrome"

/**
 * Skeleton for the Challenge Detail Page while the server reads run
 * (`getChallengeById`, `getChallengeAttempts`, project-map read). The data
 * source is local SQLite — loading is brief, but the state must exist so
 * the page never flashes empty (per #145's Page Spec §9).
 */
export default function ChallengeDetailLoading() {
  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow" aria-busy="true">
          <div
            className="page-eyebrow"
            style={{ marginTop: 24 }}
            aria-hidden="true"
          >
            <span className="dot" /> Challenge · M9
          </div>
          <div className="review-titlewrap">
            <h1 className="page-title" style={{ margin: 0 }}>
              Loading challenge…
            </h1>
          </div>
          <p className="page-subtitle" style={{ marginTop: 16 }}>
            Reading the challenge and its attempt history.
          </p>
          <section className="review-section" aria-hidden="true">
            <div className="scope-grid">
              <section>
                <h3>In scope</h3>
                <p className="inline-note">Loading…</p>
              </section>
              <section>
                <h3>Out of scope</h3>
                <p className="inline-note">Loading…</p>
              </section>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
