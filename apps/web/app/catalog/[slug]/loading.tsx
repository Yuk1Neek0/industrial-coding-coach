import { AppNav } from "../_components/chrome"

/** Loading skeleton for a Golden Path detail route. */
export default function GoldenPathLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="catalog" />
      <main className="page page-narrow">
        <div className="container-narrow">
          <div className="skel" style={{ height: 14, width: 140, marginBottom: 32 }} />
          <div className="skel" style={{ height: 12, width: 200, marginBottom: 14 }} />
          <div className="skel" style={{ height: 40, width: "80%", marginBottom: 18 }} />
          <div className="skel" style={{ height: 16, width: "100%", marginBottom: 8 }} />
          <div className="skel" style={{ height: 16, width: "70%", marginBottom: 22 }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
            <div className="skel" style={{ height: 24, width: 130, borderRadius: 999 }} />
            <div className="skel" style={{ height: 24, width: 80, borderRadius: 999 }} />
          </div>

          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="section">
              <div className="skel" style={{ height: 12, width: 180, marginBottom: 20 }} />
              <div className="skel" style={{ height: 14, width: "100%", marginBottom: 8 }} />
              <div className="skel" style={{ height: 14, width: "92%", marginBottom: 8 }} />
              <div className="skel" style={{ height: 14, width: "78%" }} />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
