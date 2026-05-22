import { AppNav } from "../../_components/chrome"

/** Loading skeleton for the Stack Explanation route (initial DB read). */
export default function StackExplanationLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="stack" />
      <main className="page">
        <div className="container-narrow">
          <header className="stack-header">
            <div className="skel" style={{ height: 13, width: 180 }} />
            <div
              className="skel"
              style={{ height: 11, width: 130, marginTop: 26 }}
            />
            <div
              className="skel"
              style={{ height: 30, width: 280, marginTop: 14 }}
            />
            <div
              className="skel"
              style={{ height: 16, width: "70%", marginTop: 16 }}
            />
          </header>

          <div
            className="skel"
            style={{ height: 92, width: "100%", marginTop: 28, borderRadius: 14 }}
          />

          {[0, 1].map((i) => (
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
