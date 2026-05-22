import { AppNav } from "../../_components/chrome"

/** Loading skeleton for the `/reviews/r/[id]` Diff Review route (spec §9). */
export default function DiffReviewLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="reviews" />
      <main className="page">
        <div className="container-narrow">
          {/* Header */}
          <div className="skel" style={{ height: 13, width: 140 }} />
          <div
            className="skel"
            style={{ height: 34, width: "70%", marginTop: 28 }}
          />
          <div
            className="skel"
            style={{ height: 14, width: 360, marginTop: 16 }}
          />

          {/* Changed-file placeholder blocks */}
          {[0, 1].map((i) => (
            <div
              key={i}
              className="skel"
              style={{
                height: 150,
                width: "100%",
                marginTop: 24,
                borderRadius: 14,
              }}
            />
          ))}

          {/* Core-logic prose block */}
          <div
            className="skel"
            style={{ height: 90, width: "100%", marginTop: 32, borderRadius: 10 }}
          />

          {/* Risk + question list placeholders */}
          <div
            className="skel"
            style={{ height: 120, width: "100%", marginTop: 32, borderRadius: 14 }}
          />
          <div
            className="skel"
            style={{ height: 180, width: "100%", marginTop: 32, borderRadius: 14 }}
          />
        </div>
      </main>
    </div>
  )
}
