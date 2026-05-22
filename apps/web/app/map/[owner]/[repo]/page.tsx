import Link from "next/link"

import { getMapPageData } from "@/lib/project-mapper"

import {
  AppNav,
  Badge,
  GitHubMark,
  IconArrowLeft,
  IconSlash,
} from "../../_components/chrome"
import { MapFlow } from "./_components/map-flow"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface MapPageParams {
  params: Promise<{ owner: string; repo: string }>
}

export async function generateMetadata({ params }: MapPageParams) {
  const { owner, repo } = await params
  return {
    title: `Project map — ${owner}/${repo}`,
    description: `How ${owner}/${repo} works as a running system, mapped against its actual files.`,
  }
}

/** The shared page header — back link, repo title, branch badge. */
function MapPageHeader({
  owner,
  repo,
  branch,
}: {
  owner: string
  repo: string
  branch?: string
}) {
  return (
    <header className="map-header">
      <Link className="back-link" href="/map">
        <IconArrowLeft size={14} /> Back to project maps
      </Link>
      <div className="page-eyebrow" style={{ marginTop: 24 }}>
        <span className="dot" /> Project map
      </div>
      <div className="map-titlewrap">
        <h1 className="page-title">
          {owner}/{repo}
        </h1>
        {branch && (
          <Badge soft mono>
            {branch}
          </Badge>
        )}
      </div>
      <p className="page-subtitle">
        How this project works as a running system — mapped against its actual
        files.
      </p>
    </header>
  )
}

/**
 * `/map/[owner]/[repo]` — the Project Map page (project-map-page spec §4/§6).
 * A Server Component shell that reads any persisted map and mounts the
 * `MapFlow` Client Component island. When the repo has no imported snapshot,
 * it renders the `not-imported` state directly — no flow to mount.
 */
export default async function ProjectMapPage({ params }: MapPageParams) {
  const { owner, repo } = await params
  const data = await getMapPageData(owner, repo)

  if (!data.snapshotExists || !data.identity) {
    return (
      <div className="screen">
        <AppNav active="map" />
        <main className="page">
          <div className="container-narrow">
            <MapPageHeader owner={owner} repo={repo} />
            <section className="status-region" role="alert">
              <div className="status-card" data-error="true">
                <div className="status-head">
                  <div className="status-icon error" aria-hidden="true">
                    <IconSlash size={18} />
                  </div>
                  <h2 className="status-title">
                    This repository isn&apos;t imported yet
                  </h2>
                </div>
                <p className="status-body">
                  A project map needs an imported snapshot of{" "}
                  <span className="code-chip">
                    {owner}/{repo}
                  </span>{" "}
                  before we can read its files and trace how they connect.
                  Import it first, then come back here.
                </p>
                <div className="status-actions">
                  <Link className="btn btn-primary" href="/import">
                    <GitHubMark size={14} /> Import this repository
                  </Link>
                  <Link className="btn btn-ghost" href="/map">
                    Browse imported repos
                  </Link>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="screen">
      <AppNav active="map" />
      <main className="page">
        <div className="container-narrow">
          <MapPageHeader
            owner={data.identity.owner}
            repo={data.identity.repo}
            branch={data.identity.branch}
          />
          <MapFlow identity={data.identity} initialMap={data.map} />
        </div>
      </main>
    </div>
  )
}
