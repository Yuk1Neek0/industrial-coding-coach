import { AppNav } from "../../../_components/chrome"

/** Loading skeleton for the `/repos/[owner]/[repo]/files` route (spec §9). */
export default function FilesLoading() {
  return (
    <div className="screen">
      <AppNav active="repos" />
      <main className="page">
        <div className="files-container" aria-busy="true">
          <div aria-hidden="true">
            <div className="skel" style={{ height: 13, width: 120 }} />
            <div
              className="skel"
              style={{ height: 32, width: "40%", marginTop: 28 }}
            />
            <div
              className="skel"
              style={{ height: 14, width: 360, marginTop: 14 }}
            />
            <div className="files-layout">
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
                  <div
                    key={i}
                    className="skel"
                    style={{ height: 26, width: "100%", borderRadius: 6 }}
                  />
                ))}
              </div>
              <div
                className="skel"
                style={{ height: 420, width: "100%", borderRadius: 14 }}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
