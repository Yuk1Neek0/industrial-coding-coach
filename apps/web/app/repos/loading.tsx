import { AppNav } from "./_components/chrome"

/** Loading skeleton for the `/repos` hub route (page spec §9). */
export default function ReposHubLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="repos" />
      <main className="page">
        <div className="container-narrow">
          <div className="skel" style={{ height: 13, width: 160 }} aria-hidden="true" />
          <div
            className="skel"
            style={{ height: 32, width: "40%", marginTop: 28 }}
            aria-hidden="true"
          />
          <div
            className="skel"
            style={{ height: 14, width: 320, marginTop: 14 }}
            aria-hidden="true"
          />
          <div
            style={{
              marginTop: 32,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="skel"
                style={{ height: 132, width: "100%", borderRadius: 14 }}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
