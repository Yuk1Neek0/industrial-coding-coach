import { AppNav } from "../_components/chrome"

/** Loading skeleton for a recommendation result (page spec §9). */
export default function RecommendationLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="recommend" />
      <main className="page">
        <div className="container-narrow">
          <div className="skel" style={{ height: 14, width: 200, marginBottom: 28 }} />
          <div className="skel" style={{ height: 12, width: 160, marginBottom: 12 }} />
          <div className="skel" style={{ height: 36, width: "60%", marginBottom: 10 }} />
          <div className="skel" style={{ height: 12, width: 220 }} />

          <div className="skel" style={{ height: 80, marginTop: 28, borderRadius: 10 }} />

          <div className="r-skel-headline">
            <div className="skel" style={{ height: 14, width: 220, marginBottom: 18 }} />
            <div className="skel" style={{ height: 34, width: "70%", marginBottom: 14 }} />
            <div className="skel" style={{ height: 14, width: "100%", marginBottom: 6 }} />
            <div className="skel" style={{ height: 14, width: "80%", marginBottom: 18 }} />
            <div className="skel" style={{ height: 42, width: 220, borderRadius: 10 }} />
          </div>

          {[0, 1].map((i) => (
            <div key={i} style={{ marginTop: 32 }}>
              <div className="skel" style={{ height: 12, width: 240, marginBottom: 16 }} />
              <div className="skel" style={{ height: 110, borderRadius: 14 }} />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
