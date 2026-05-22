import { AppNav } from "../../_components/chrome"

/** Loading skeleton for the `/reviews/[owner]/[repo]` PR picker route. */
export default function ReviewRepoLoading() {
  return (
    <div className="screen" aria-busy="true">
      <AppNav active="reviews" />
      <main className="page">
        <div className="container-narrow">
          <div className="skel" style={{ height: 13, width: 160 }} />
          <div
            className="skel"
            style={{ height: 36, width: 280, marginTop: 28 }}
          />
          <div
            className="skel"
            style={{ height: 16, width: 420, marginTop: 18 }}
          />
          <div
            className="skel"
            style={{ height: 200, width: "100%", marginTop: 32, borderRadius: 14 }}
          />
        </div>
      </main>
    </div>
  )
}
