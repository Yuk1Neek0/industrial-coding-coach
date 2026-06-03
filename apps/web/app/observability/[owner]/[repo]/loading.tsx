import { AppNav } from "./_components/chrome"

/**
 * Skeleton for the M13 Observability Page while the local-SQLite read runs
 * (`getObservability`). Loading is brief, but the state must exist so the page
 * never flashes empty. The page never shows a network/LLM in-progress state —
 * nothing async to GitHub or Anthropic happens at view (Page Spec §9).
 */
export default function ObservabilityLoading() {
  return (
    <div className="screen">
      <AppNav active="observability" />
      <main className="page">
        <div className="container-narrow" aria-busy="true">
          <div
            className="page-eyebrow"
            style={{ marginTop: 24 }}
            aria-hidden="true"
          >
            <span className="dot" /> Observability · M13
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
            Reading this repository&apos;s observability from the local snapshot.
          </p>
          <div aria-hidden="true">
            {["summary", "traces", "part-b"].map((slug) => (
              <section className="review-section" key={slug}>
                <div className="review-section-head">
                  <h2 style={{ opacity: 0.4 }}>…</h2>
                </div>
                <div
                  className="file-card"
                  style={{ marginTop: 8, opacity: 0.4 }}
                >
                  <div className="file-card-head">
                    <h3 style={{ margin: 0 }}>……</h3>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
