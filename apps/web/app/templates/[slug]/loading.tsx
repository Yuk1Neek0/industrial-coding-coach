import { AppNav } from "../_components/chrome"

/** Loading skeleton for a template detail route, including the Fit block. */
export default function TemplateLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="templates" />
      <main className="page page-narrow">
        <div className="container-narrow">
          <div className="skel" style={{ height: 14, width: 140, marginBottom: 32 }} />
          <div className="skel" style={{ height: 12, width: 200, marginBottom: 14 }} />
          <div className="skel" style={{ height: 40, width: "80%", marginBottom: 18 }} />
          <div className="skel" style={{ height: 16, width: "100%", marginBottom: 8 }} />
          <div className="skel" style={{ height: 16, width: "70%", marginBottom: 22 }} />
          <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
            <div className="skel" style={{ height: 24, width: 130, borderRadius: 999 }} />
            <div className="skel" style={{ height: 24, width: 90, borderRadius: 999 }} />
          </div>

          {[0, 1].map((i) => (
            <div key={i} className="section">
              <div className="skel" style={{ height: 12, width: 180, marginBottom: 20 }} />
              <div className="skel" style={{ height: 14, width: "100%", marginBottom: 8 }} />
              <div className="skel" style={{ height: 14, width: "92%", marginBottom: 8 }} />
              <div className="skel" style={{ height: 14, width: "78%" }} />
            </div>
          ))}

          {/* Template Fit skeleton */}
          <div className="section">
            <div className="skel" style={{ height: 18, width: 180, marginBottom: 10 }} />
            <div className="skel" style={{ height: 12, width: 280, marginBottom: 18 }} />
            <div
              className="skel"
              style={{ height: 72, width: "100%", borderRadius: 10, marginBottom: 18 }}
            />
            {[0, 1, 2].map((j) => (
              <div key={j} style={{ padding: "16px 0", borderTop: "1px solid var(--border)" }}>
                <div className="skel" style={{ height: 14, width: "45%", marginBottom: 8 }} />
                <div className="skel" style={{ height: 12, width: "92%" }} />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
