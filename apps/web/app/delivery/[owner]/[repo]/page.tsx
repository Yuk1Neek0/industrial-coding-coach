import Link from "next/link"
import { notFound } from "next/navigation"

import type {
  CcpmDegradationTeaching,
  CcpmEpicNode,
  CcpmIssueLink,
  CcpmPrdNode,
  CcpmTaskNode,
  CcpmTeaching,
  CcpmTraceabilityMap,
} from "@workspace/db"

import { getDeliveryPageData } from "@/lib/delivery"

import {
  AppNav,
  Badge,
  IconArrowLeft,
  IconExternal,
  IconRefresh,
  IconSlash,
} from "./_components/chrome"

// The page reads the local SQLite database — render per request.
export const dynamic = "force-dynamic"

interface DeliveryParams {
  params: Promise<{ owner: string; repo: string }>
}

export async function generateMetadata({ params }: DeliveryParams) {
  const { owner, repo } = await params
  return {
    title: `Delivery — ${owner}/${repo}`,
    description: `How ${owner}/${repo} was delivered: PRD → epic → task → issue → PR.`,
  }
}

/**
 * `/delivery/[owner]/[repo]` — the M12 Delivery Traceability Page (Page Spec
 * §4 / §6, task #205). A React Server Component that reads the local snapshot
 * and renders either the PRD → Epic → Task → Issue → PR map with the
 * deterministic teaching layer, or the graceful-degradation educational state
 * for a repo with no spec-driven workflow.
 *
 * **Read-only and offline** (ADR 0009): no Server Actions, no mutations, no
 * network, no API key. Links were resolved at import; the teaching is
 * deterministic. Opening the URL with `GITHUB_TOKEN` / `ANTHROPIC_API_KEY`
 * unset renders the page.
 */
export default async function DeliveryPage({ params }: DeliveryParams) {
  const { owner, repo } = await params
  const data = await getDeliveryPageData(owner, repo)

  if (!data.snapshotExists || !data.identity || !data.result) {
    notFound()
  }

  const { identity, result } = data

  return (
    <div className="screen">
      <AppNav active="delivery" />
      <main className="page">
        <div className="container-narrow">
          {/* ── Header (both states) ───────────────────────────────── */}
          <header>
            <Link className="back-link" href="/import">
              <IconArrowLeft size={14} /> Back to imported repositories
            </Link>
            <div className="page-eyebrow" style={{ marginTop: 24 }}>
              <span className="dot" /> Delivery · M12
            </div>
            <div className="review-titlewrap" style={{ marginTop: 0 }}>
              <h1 className="page-title" style={{ margin: 0 }}>
                {identity.owner}/{identity.repo}
              </h1>
              <Badge soft mono>
                {identity.branch}
              </Badge>
            </div>
            <p className="page-subtitle" style={{ marginTop: 16 }}>
              How this repository was delivered — from requirement to shipped
              code.
            </p>
            <div
              className="status-actions"
              style={{ marginTop: 14, gap: 12, flexWrap: "wrap" }}
            >
              <span className="hint">Read-only · local snapshot · no network</span>
              <Link className="hint" href="/import">
                <IconRefresh size={12} /> Re-import to refresh
              </Link>
            </div>
          </header>

          {result.kind === "absent" ? (
            <DegradationPanel teaching={result.teaching} />
          ) : (
            <DeliveryMapView
              map={result.map}
              teaching={result.teaching}
              links={result.links}
              owner={identity.owner}
              repo={identity.repo}
            />
          )}
        </div>
      </main>
    </div>
  )
}

/* ── Degradation / educational state (§6c, US-4) ───────────────────────── */

function DegradationPanel({
  teaching,
}: {
  teaching: CcpmDegradationTeaching
}) {
  return (
    <section
      className="review-section"
      aria-labelledby="h-degradation"
      style={{ marginTop: 20 }}
    >
      <div className="review-section-head">
        <h2 id="h-degradation" tabIndex={-1}>
          {teaching.title}
        </h2>
      </div>
      <p className="file-explanation">{teaching.body}</p>
      <p className="hint" style={{ marginTop: 8 }}>
        We looked for: {teaching.searched.join(", ")}
      </p>
      <div className="status-actions" style={{ marginTop: 16, gap: 8, flexWrap: "wrap" }}>
        <Link
          className="btn btn-primary"
          href={`/catalog/${teaching.goldenPath.slug}`}
        >
          Learn the {teaching.goldenPath.label} →
        </Link>
        <Link className="btn" href="/import">
          Import a different repository
        </Link>
      </div>
    </section>
  )
}

/* ── Populated map (§6b) ───────────────────────────────────────────────── */

function DeliveryMapView({
  map,
  teaching,
  links,
  owner,
  repo,
}: {
  map: CcpmTraceabilityMap
  teaching: CcpmTeaching
  links: Record<string, CcpmIssueLink>
  owner: string
  repo: string
}) {
  const { stats } = map
  return (
    <>
      {/* ── Teaching headline + stats strip (§6b item 1) ─────────────── */}
      <section className="review-section" style={{ marginTop: 20 }}>
        <p className="page-subtitle" style={{ marginTop: 0 }}>
          {teaching.headline}
        </p>
        <div className="file-counts" style={{ marginTop: 10, gap: 6, flexWrap: "wrap" }}>
          <Badge soft>{stats.prdCount} PRDs</Badge>
          <Badge soft>{stats.epicCount} epics</Badge>
          <Badge soft>{stats.taskCount} tasks</Badge>
          <Badge soft>{stats.syncedTaskCount} tracked</Badge>
          <Badge soft>{stats.closedTaskCount} done</Badge>
          <Badge soft>{stats.archivedEpicCount} archived</Badge>
        </div>
      </section>

      {/* ── The traceability tree (§6b item 2) ───────────────────────── */}
      <section className="review-section" aria-labelledby="h-map">
        <div className="review-section-head">
          <h2 id="h-map" tabIndex={-1}>
            Delivery map
          </h2>
          <span className="hint">PRD → Epic → Task → Issue → PR</span>
        </div>
        {map.prds.map((prd) => (
          <PrdBlock
            prd={prd}
            links={links}
            owner={owner}
            repo={repo}
            key={prd.path}
          />
        ))}
        {map.orphanEpics.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3>Epics without a PRD</h3>
            <p className="hint">
              These epics don&apos;t link to a PRD in the snapshot — shown so
              nothing is lost.
            </p>
            {map.orphanEpics.map((epic) => (
              <EpicBlock
                epic={epic}
                links={links}
                owner={owner}
                repo={repo}
                key={epic.path}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── How to read this (the teaching concepts, §6b) ────────────── */}
      <section className="review-section" aria-labelledby="h-teaching">
        <div className="review-section-head">
          <h2 id="h-teaching" tabIndex={-1}>
            How to read this
          </h2>
          <span className="hint">
            Plain-language explanations of each part, from your repo&apos;s real
            numbers.
          </span>
        </div>
        {teaching.concepts.map((concept) => (
          <div style={{ marginTop: 12 }} key={concept.artifact}>
            <h3>{concept.title}</h3>
            <p className="file-explanation">{concept.body}</p>
          </div>
        ))}
      </section>

      {/* ── Why this matters in an interview (professional value) ────── */}
      <section className="review-section" aria-labelledby="h-value">
        <div className="review-section-head">
          <h2 id="h-value" tabIndex={-1}>
            Why this matters in an interview
          </h2>
        </div>
        <ul style={{ paddingLeft: 18 }}>
          {teaching.professionalValue.map((value) => (
            <li key={value} style={{ marginBottom: 6 }}>
              {value}
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function PrdBlock({
  prd,
  links,
  owner,
  repo,
}: {
  prd: CcpmPrdNode
  links: Record<string, CcpmIssueLink>
  owner: string
  repo: string
}) {
  return (
    <div className="file-card" style={{ marginBottom: 12 }}>
      <div className="file-card-head">
        <h3 style={{ margin: 0 }}>{prd.name}</h3>
        <Badge soft mono>
          PRD
        </Badge>
        {prd.status && <Badge soft>{prd.status}</Badge>}
      </div>
      {prd.description && (
        <p className="file-explanation" style={{ marginTop: 8 }}>
          {prd.description}
        </p>
      )}
      {prd.epics.length === 0 ? (
        <p className="hint" style={{ marginTop: 8 }}>
          No epics linked to this PRD yet.
        </p>
      ) : (
        prd.epics.map((epic) => (
          <EpicBlock
            epic={epic}
            links={links}
            owner={owner}
            repo={repo}
            key={epic.path}
          />
        ))
      )}
    </div>
  )
}

function EpicBlock({
  epic,
  links,
  owner,
  repo,
}: {
  epic: CcpmEpicNode
  links: Record<string, CcpmIssueLink>
  owner: string
  repo: string
}) {
  return (
    <div
      style={{
        marginTop: 12,
        paddingLeft: 12,
        borderLeft: "2px solid var(--border)",
      }}
    >
      <div className="file-card-head">
        <h4 style={{ margin: 0 }}>{epic.name}</h4>
        {epic.status && (
          <Badge soft>
            {epic.status}
            {epic.progress ? ` · ${epic.progress}` : ""}
          </Badge>
        )}
        {epic.issueNumber !== null && (
          <Badge soft mono>
            Epic #{epic.issueNumber}
          </Badge>
        )}
        {epic.archived && <Badge soft>Archived</Badge>}
        {epic.synthetic && <span className="hint">(inferred from tasks)</span>}
      </div>
      {epic.tasks.length === 0 ? (
        <p className="hint" style={{ marginTop: 6 }}>
          No tasks in this epic.
        </p>
      ) : (
        <ul style={{ paddingLeft: 18, marginTop: 8 }}>
          {epic.tasks.map((task) => (
            <TaskItem
              task={task}
              link={links[task.taskRef]}
              owner={owner}
              repo={repo}
              key={task.taskRef}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function TaskItem({
  task,
  link,
  owner,
  repo,
}: {
  task: CcpmTaskNode
  link: CcpmIssueLink | undefined
  owner: string
  repo: string
}) {
  return (
    <li style={{ marginBottom: 10 }}>
      <strong>{task.name}</strong>{" "}
      {task.status && <Badge soft>{task.status}</Badge>}{" "}
      <TaskLinkStatus task={task} link={link} owner={owner} repo={repo} />
      {task.dependsOn.length > 0 && (
        <span className="hint" style={{ marginLeft: 6 }}>
          depends on {task.dependsOn.map((n) => `#${n}`).join(", ")}
        </span>
      )}
    </li>
  )
}

/** The per-task issue/PR link status chip (Page Spec §6b-i). */
function TaskLinkStatus({
  task,
  link,
  owner,
  repo,
}: {
  task: CcpmTaskNode
  link: CcpmIssueLink | undefined
  owner: string
  repo: string
}) {
  if (!task.synced) {
    return (
      <Badge soft>
        <IconSlash size={11} /> Not tracked
      </Badge>
    )
  }

  const issueUrl = `https://github.com/${owner}/${repo}/issues/${task.issueNumber}`

  // Synced, but links not resolved yet (linking pass hasn't run).
  if (!link) {
    return (
      <a href={issueUrl} target="_blank" rel="noreferrer" className="hint">
        Issue #{task.issueNumber} <IconExternal size={11} />
      </a>
    )
  }

  // Link resolution failed — calm, beginner-safe reason (never an HTTP code).
  if (link.failureReason) {
    return (
      <>
        <Badge soft tone="warn">
          Issue #{link.issueNumber} · couldn&apos;t link
        </Badge>
        <span className="hint" style={{ marginLeft: 6 }}>
          {link.failureReason}
        </span>
      </>
    )
  }

  if (link.issueState === "open") {
    return (
      <Badge soft>
        <a href={issueUrl} target="_blank" rel="noreferrer">
          Issue #{link.issueNumber}
        </a>{" "}
        · open
      </Badge>
    )
  }

  // Closed.
  return (
    <Badge soft>
      <a href={issueUrl} target="_blank" rel="noreferrer">
        Issue #{link.issueNumber}
      </a>{" "}
      · closed
      {link.closingPrNumber !== null && link.closingPrUrl && (
        <>
          {" · "}
          <a href={link.closingPrUrl} target="_blank" rel="noreferrer">
            PR #{link.closingPrNumber} <IconExternal size={11} />
          </a>
        </>
      )}
    </Badge>
  )
}
