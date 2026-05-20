import { AppNav } from "./_components/chrome"

/** Loading skeleton for the catalog list route. */
export default function CatalogLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="catalog" />
      <main className="page">
        <div className="container">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Catalog · M2
            </div>
            <h1 className="page-title">Golden Path Catalog</h1>
            <p className="page-subtitle">
              Curated routes for understanding an AI-assisted project. Pick the
              one that matches yours.
            </p>
          </header>

          <div className="filter-bar">
            <div className="skel" style={{ height: 38, width: 420, borderRadius: 10 }} />
            <div className="skel" style={{ height: 38, width: 160, borderRadius: 10 }} />
          </div>
          <div className="skel" style={{ marginTop: 18, height: 14, width: 80 }} />

          <div className="grid" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="card" style={{ cursor: "default" }}>
                <div className="skel" style={{ height: 22, width: 120, borderRadius: 999 }} />
                <div className="skel" style={{ height: 22, width: "70%", marginTop: 16 }} />
                <div className="skel" style={{ height: 12, width: "100%", marginTop: 14 }} />
                <div className="skel" style={{ height: 12, width: "92%", marginTop: 8 }} />
                <div className="skel" style={{ height: 12, width: "60%", marginTop: 8 }} />
                <div className="card-foot">
                  <div className="skel" style={{ height: 11, width: 120 }} />
                  <div className="skel" style={{ height: 11, width: 50 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
