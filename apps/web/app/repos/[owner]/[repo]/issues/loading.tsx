import { AppNav } from "../../../_components/chrome"

/** Loading skeleton for the `/repos/[owner]/[repo]/issues` route (spec §9). */
export default function IssuesLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <div className="skel" style={{ height: 13, width: 160 }} />
          <div
            className="skel"
            style={{ height: 32, width: "40%", marginTop: 28 }}
          />
          <div
            className="skel"
            style={{ height: 14, width: 320, marginTop: 14 }}
          />
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 8 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="skel"
                style={{ height: 72, width: "100%", borderRadius: 10 }}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
