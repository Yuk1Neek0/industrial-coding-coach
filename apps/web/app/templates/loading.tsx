import { AppNav } from "./_components/chrome"

/** Loading skeleton for the Template Registry list route. */
export default function TemplatesLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="templates" />
      <main className="page">
        <div className="container">
          <header>
            <div className="page-eyebrow">
              <span className="dot" /> Registry · M3
            </div>
            <h1 className="page-title">Template Registry</h1>
            <p className="page-subtitle">
              The building blocks behind the Golden Paths. Browse the templates
              a project is built on and see how each one fits.
            </p>
          </header>

          <div className="filter-bar">
            <div className="skel" style={{ height: 38, width: 420, borderRadius: 10 }} />
            <div className="skel" style={{ height: 38, width: 180, borderRadius: 10 }} />
            <div
              className="skel"
              style={{ height: 38, width: 180, borderRadius: 10, marginLeft: "auto" }}
            />
          </div>
          <div className="skel" style={{ marginTop: 18, height: 14, width: 100 }} />

          {[0, 1].map((group) => (
            <section key={group} className="cat-section">
              <div className="skel" style={{ height: 12, width: 200, marginBottom: 8 }} />
              <div className="grid" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="card" style={{ cursor: "default" }}>
                    <div className="skel" style={{ height: 22, width: 120, borderRadius: 999 }} />
                    <div className="skel" style={{ height: 22, width: "70%", marginTop: 16 }} />
                    <div className="skel" style={{ height: 12, width: "100%", marginTop: 14 }} />
                    <div className="skel" style={{ height: 12, width: "85%", marginTop: 8 }} />
                    <div className="card-foot">
                      <div className="skel" style={{ height: 11, width: 120 }} />
                      <div className="skel" style={{ height: 11, width: 90 }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
