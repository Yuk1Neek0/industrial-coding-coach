"use client"

// The interactive Project Map flow — the host page's Client Component island
// (project-map-page spec §5). It owns the trigger interaction and the
// status/result region: resting → in-progress → mapped, plus the in-page
// error states. It runs the mapping pipeline via the `generateProjectMapAction`
// Server Action and never touches the LangGraph pipeline or the model itself.
//
// On the mapped state it composes the three component UIs the page spec hosts:
// the File Map Explorer, the Architecture Flow Viewer (which owns the
// client-side Mermaid rendering), and the Debug Path UI.

import Link from "next/link"
import { useState } from "react"

import type {
  MapErrorKind,
  ProjectMapView,
  RepoIdentity,
} from "@/lib/project-mapper"

import { ArchitectureFlowViewer } from "../../../_components/architecture-flow-viewer"
import {
  GitHubMark,
  IconAlert,
  IconBox,
  IconCheck,
  IconInfo,
  IconKey,
  IconLayers,
  IconLoader,
  IconSlash,
  IconSparkles,
} from "../../../_components/chrome"
import { DebugPathUi } from "../../../_components/debug-path-ui"
import { FileMapExplorer } from "../../../_components/file-map-explorer"
import { relTime } from "../../../_components/util"
import { generateProjectMapAction } from "../../../actions"

type Status = "resting" | "in-progress" | "mapped" | "error"

/* ── Section navigation ───────────────────────────────────────────── */

function SectionNav() {
  return (
    <nav className="section-nav" aria-label="On this page">
      <a href="#sec-overview">Overview</a>
      <a href="#sec-files">Key files</a>
      <a href="#sec-flows">Flows</a>
      <a href="#sec-debug">Debug path</a>
    </nav>
  )
}

/* ── Architecture overview ────────────────────────────────────────── */

function ArchitectureOverview({
  layers,
}: {
  layers: ProjectMapView["architectureOverview"]
}) {
  if (layers.length === 0) {
    return (
      <p className="inline-empty">
        <IconBox size={13} /> No architecture layers were identified for this
        project.
      </p>
    )
  }
  return (
    <ul className="arch-layers">
      {layers.map((layer, i) => (
        <li key={`${layer.title}-${i}`}>
          <article className="arch-card">
            <h3>{layer.title}</h3>
            <p className="arch-card-detail">{layer.detail}</p>
          </article>
        </li>
      ))}
    </ul>
  )
}

/* ── Mapped result ────────────────────────────────────────────────── */

/** The quiet, non-blocking integrity verification note (page spec §6). */
function IntegrityNote({ map }: { map: ProjectMapView }) {
  const { integrity } = map
  const unresolved =
    integrity.missingKeyFiles.length + integrity.missingFlowPaths.length
  if (unresolved === 0) return null
  const checked =
    map.keyFileMap.length +
    map.requestDataFlow.length +
    map.stateFlow.length +
    map.aiCallFlow.length
  return (
    <p className="integrity-note" role="status">
      <span className="integrity-icon" aria-hidden="true">
        <IconInfo size={13} />
      </span>
      Some file references could not be verified against the snapshot (
      {unresolved} of {checked}). The map is still complete and usable.
    </p>
  )
}

function MappedView({
  map,
  busy,
  onRemap,
}: {
  map: ProjectMapView
  busy: boolean
  onRemap: () => void
}) {
  return (
    <>
      <div className="map-trigger quiet">
        <div className="quiet-row">
          <span className="quiet-text">
            <IconCheck size={13} /> Mapped {relTime(map.updatedAt)} ·{" "}
            {map.keyFileMap.length} key file
            {map.keyFileMap.length === 1 ? "" : "s"}
          </span>
          <span style={{ marginLeft: "auto" }}>
            <button
              type="button"
              className="btn"
              onClick={onRemap}
              disabled={busy}
            >
              <IconSparkles size={13} /> Re-map
            </button>
          </span>
        </div>
        <IntegrityNote map={map} />
        {map.notes.length > 0 && (
          <details className="pipeline-notes">
            <summary>
              Mapping notes ({map.notes.length}) — how the map degraded
              gracefully
            </summary>
            <ul>
              {map.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <SectionNav />

      <section
        className="map-section"
        id="sec-overview"
        aria-labelledby="h-overview"
      >
        <div className="map-section-head">
          <h2 id="h-overview">Architecture overview</h2>
          <span className="hint">the shape of the whole project</span>
        </div>
        <ArchitectureOverview layers={map.architectureOverview} />
      </section>

      <section
        className="map-section"
        id="sec-files"
        aria-labelledby="h-files"
      >
        <div className="map-section-head">
          <h2 id="h-files">Key files</h2>
          <span className="hint">where this project&apos;s logic lives</span>
        </div>
        <FileMapExplorer keyFiles={map.keyFileMap} />
      </section>

      <section
        className="map-section"
        id="sec-flows"
        aria-labelledby="h-flows"
      >
        <div className="map-section-head">
          <h2 id="h-flows">How this project works</h2>
          <span className="hint">trace a request, state, and AI calls</span>
        </div>
        <ArchitectureFlowViewer
          mermaidDiagram={map.mermaidDiagram}
          requestDataFlow={map.requestDataFlow}
          stateFlow={map.stateFlow}
          aiCallFlow={map.aiCallFlow}
        />
      </section>

      <section
        className="map-section"
        id="sec-debug"
        aria-labelledby="h-debug"
      >
        <div className="map-section-head">
          <h2 id="h-debug">Where to start debugging</h2>
          <span className="hint">if something breaks, look here</span>
        </div>
        <DebugPathUi debugPath={map.debugPath} />
      </section>

      <footer className="map-footer">
        owner/repo:{" "}
        <span className="val">
          {map.owner}/{map.repo}
        </span>
        <span className="sep">·</span>
        milestone 6 · project logic mapper
      </footer>
    </>
  )
}

/* ── In-progress ──────────────────────────────────────────────────── */

function InProgressView({ identity }: { identity: RepoIdentity }) {
  return (
    <section className="status-region" aria-live="polite" aria-busy="true">
      <div className="status-card">
        <div className="status-head">
          <div className="status-icon busy" aria-hidden="true">
            <IconLoader size={18} />
          </div>
          <h2 className="status-title">
            Mapping the {identity.owner}/{identity.repo} project…
          </h2>
        </div>
        <p className="status-body">
          Reading your project&apos;s files, tracing how they connect, and
          drawing the diagrams. This is a multi-step analysis and usually takes
          30–90 seconds.
        </p>
        <div
          className="progress"
          role="progressbar"
          aria-label="Mapping project"
        >
          <div className="progress-bar" />
        </div>
        <div className="progress-label">
          <IconLoader size={13} />
          Reading files · tracing flows · drawing diagrams
        </div>
      </div>
    </section>
  )
}

/* ── Error states ─────────────────────────────────────────────────── */

interface ErrorCopy {
  icon: React.ReactNode
  title: string
  body: React.ReactNode
}

const ERROR_COPY: Record<MapErrorKind, ErrorCopy> = {
  "not-imported": {
    icon: <IconSlash size={18} />,
    title: "This repository isn't imported yet",
    body: (
      <>
        A project map needs an imported snapshot before we can read your files
        and trace how they connect. Import it first, then come back here.
      </>
    ),
  },
  "missing-api-key": {
    icon: <IconKey size={18} />,
    title: "AI mapping isn't configured",
    body: (
      <>
        The map is generated by an AI pipeline and needs an{" "}
        <span className="code-chip">ANTHROPIC_API_KEY</span> set in your
        project&apos;s <span className="code-chip">.env</span> file (see{" "}
        <span className="code-chip">.env.example</span>). The key is read
        server-side only and is never collected in the UI.
      </>
    ),
  },
  "empty-snapshot": {
    icon: <IconAlert size={18} />,
    title: "We couldn't find any code to map",
    body: "The imported snapshot has no recognizable source files. The repository might not be a code project, or its files weren't imported — re-importing usually fixes this.",
  },
  "pipeline-failure": {
    icon: <IconAlert size={18} />,
    title: "The map couldn't be generated",
    body: "The mapping pipeline failed partway through. This is often a rate limit or a temporary network problem — it usually clears on retry.",
  },
  unknown: {
    icon: <IconAlert size={18} />,
    title: "Something went wrong",
    body: "Something unexpected happened while mapping the project. Try once more — if it keeps failing, restart the dev server.",
  },
}

function ErrorView({
  kind,
  previousMap,
  onTryAgain,
}: {
  kind: MapErrorKind
  previousMap: ProjectMapView | null
  onTryAgain: () => void
}) {
  const copy = ERROR_COPY[kind]
  return (
    <>
      <section className="status-region" aria-live="polite" role="alert">
        <div className="status-card" data-error="true">
          <div className="status-head">
            <div className="status-icon error" aria-hidden="true">
              {copy.icon}
            </div>
            <h2 className="status-title">{copy.title}</h2>
          </div>
          <p className="status-body">{copy.body}</p>
          <div className="status-actions">
            {kind === "not-imported" ? (
              <Link className="btn btn-primary" href="/import">
                <GitHubMark size={14} /> Import this repository
              </Link>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onTryAgain}
              >
                <IconSparkles size={14} /> Try again
              </button>
            )}
            <Link className="btn btn-ghost" href="/map">
              Browse other repos
            </Link>
          </div>
        </div>
      </section>
      {/* A failed re-map keeps the previously stored map visible (spec §11). */}
      {previousMap && (
        <MappedView map={previousMap} busy={false} onRemap={onTryAgain} />
      )}
    </>
  )
}

/* ── Resting (not mapped yet) ─────────────────────────────────────── */

function RestingView({
  busy,
  onMap,
}: {
  busy: boolean
  onMap: () => void
}) {
  return (
    <section className="map-trigger" aria-live="polite">
      <div className="map-trigger-text">
        <strong>This project hasn&apos;t been mapped yet</strong>
        We&apos;ll read your project&apos;s files and produce a plain-language
        architecture overview, a key-file map, the request / state / AI-call
        flows as diagrams, and a debug path — all tied to your real files.
      </div>
      <button
        type="button"
        className="btn btn-primary btn-lg"
        onClick={onMap}
        disabled={busy}
      >
        <IconLayers size={14} />
        Map this project
      </button>
    </section>
  )
}

/* ── The flow ─────────────────────────────────────────────────────── */

/**
 * The trigger + status/result region for `/map/[owner]/[repo]`.
 *
 * @param identity - the imported repo this page maps.
 * @param initialMap - a stored map rendered on load, or `null` when the repo
 *   has not been mapped yet (the resting state).
 */
export function MapFlow({
  identity,
  initialMap,
}: {
  identity: RepoIdentity
  initialMap: ProjectMapView | null
}) {
  const [status, setStatus] = useState<Status>(
    initialMap ? "mapped" : "resting",
  )
  const [map, setMap] = useState<ProjectMapView | null>(initialMap)
  const [errorKind, setErrorKind] = useState<MapErrorKind | null>(null)

  const busy = status === "in-progress"

  async function runMapping() {
    if (busy) return
    setStatus("in-progress")
    setErrorKind(null)
    const result = await generateProjectMapAction({
      owner: identity.owner,
      repo: identity.repo,
    })
    if (result.ok) {
      setMap(result.map)
      setStatus("mapped")
    } else {
      setErrorKind(result.error.kind)
      setStatus("error")
    }
  }

  if (status === "in-progress") {
    return <InProgressView identity={identity} />
  }
  if (status === "error" && errorKind) {
    return (
      <ErrorView
        kind={errorKind}
        previousMap={map}
        onTryAgain={() => void runMapping()}
      />
    )
  }
  if (status === "mapped" && map) {
    return (
      <MappedView
        map={map}
        busy={busy}
        onRemap={() => void runMapping()}
      />
    )
  }
  return <RestingView busy={busy} onMap={() => void runMapping()} />
}
