import { AppNav } from "../../_components/chrome"

/** Loading skeleton for the Project Map route (initial DB read). */
export default function ProjectMapLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="map" />
      <main className="page">
        <div className="container-narrow">
          <header className="map-header">
            <div className="skel" style={{ height: 13, width: 160 }} />
            <div
              className="skel"
              style={{ height: 11, width: 110, marginTop: 26 }}
            />
            <div
              className="skel"
              style={{ height: 30, width: 300, marginTop: 14 }}
            />
            <div
              className="skel"
              style={{ height: 16, width: "75%", marginTop: 16 }}
            />
          </header>

          <div
            className="skel"
            style={{
              height: 96,
              width: "100%",
              marginTop: 28,
              borderRadius: 14,
            }}
          />

          {[0, 1, 2].map((i) => (
            <div key={i} style={{ marginTop: 48 }}>
              <div className="skel" style={{ height: 22, width: 220 }} />
              <div
                className="skel"
                style={{
                  height: 150,
                  width: "100%",
                  marginTop: 18,
                  borderRadius: 14,
                }}
              />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
