import { AppNav } from "../../../../_components/chrome"

/** Loading skeleton for the Issue Learning Workspace route (spec §9). */
export default function WorkspaceLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <div className="skel" style={{ height: 13, width: 140 }} />
          <div
            className="skel"
            style={{ height: 34, width: "70%", marginTop: 28 }}
          />
          <div
            className="skel"
            style={{ height: 14, width: 360, marginTop: 14 }}
          />
          <div
            className="skel"
            style={{ height: 80, width: "100%", marginTop: 36, borderRadius: 10 }}
          />
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="skel"
              style={{
                height: 110,
                width: "100%",
                marginTop: 24,
                borderRadius: 10,
              }}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
