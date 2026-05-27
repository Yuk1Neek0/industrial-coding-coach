import { AppNav } from "./_components/chrome"

/**
 * Skeleton for the M10 Portfolio Page while the server reads run
 * (`getImportedRepo`, `getMemory`, `isMemoryStale`). The data source is
 * local SQLite — loading is brief, but the state must exist so the page
 * never flashes empty. Page Spec §9 — the page never shows an
 * LLM-in-progress state on render (only inside Regenerate, on click).
 */
export default function PortfolioLoading() {
  return (
    <div className="screen">
      <AppNav active="portfolio" />
      <main className="page">
        <div className="container-narrow" aria-busy="true">
          <div
            className="page-eyebrow"
            style={{ marginTop: 24 }}
            aria-hidden="true"
          >
            <span className="dot" /> Portfolio · M10
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
            Reading your cached learning memory for this snapshot.
          </p>
          {/* Five section placeholders matching the five artifact sections. */}
          <div aria-hidden="true">
            {["#architecture", "#memory-tree", "#interview-qa", "#resume-bullets", "#debug-stories"].map(
              (slug) => (
                <section className="review-section" key={slug}>
                  <div className="review-section-head">
                    <h2>Loading…</h2>
                  </div>
                  <p className="file-explanation">Loading section…</p>
                </section>
              ),
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
