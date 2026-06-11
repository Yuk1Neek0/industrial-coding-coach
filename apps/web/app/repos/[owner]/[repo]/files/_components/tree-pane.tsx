import Link from "next/link"

import { Badge } from "../../../../_components/chrome"
import {
  categoryBadge,
  fileHref,
  formatCount,
  humanSize,
  type TreePaneModel,
  type TreeRowModel,
} from "../_lib/view"

// The tree pane of the M17 Snapshot File Viewer (task #268, page spec §6b):
// the FULL stored file tree grouped by top-level directory — root files
// first, one native `<details>` per top-level directory, flat path-sorted
// lists inside. Server-rendered only: native disclosures + plain links, no
// tree library, no virtualization, no client JS.

/** One blob row: a link per entry, badge for captured, muted otherwise. */
function TreeEntryRow({
  owner,
  repo,
  row,
  selected,
}: {
  owner: string
  repo: string
  row: TreeRowModel
  selected: boolean
}) {
  const badge = row.category ? categoryBadge(row.category) : null
  // Capture state is announced as text, never color-only (§13).
  const accessibleName = badge
    ? `${row.path} — captured, ${badge.long}`
    : `${row.path} — content not captured`
  return (
    <li className="files-entry">
      <Link
        className={
          badge ? "files-entry-link" : "files-entry-link files-entry-muted"
        }
        href={fileHref(owner, repo, row.path)}
        aria-current={selected ? "true" : undefined}
        aria-label={accessibleName}
      >
        <span className="files-entry-path mono">{row.label}</span>
        {badge && <Badge soft>{badge.short}</Badge>}
        {row.size !== undefined && (
          <span className="files-entry-size mono">{humanSize(row.size)}</span>
        )}
      </Link>
    </li>
  )
}

/**
 * The tree pane (§6b). A `<nav>` landmark — it is navigation within the
 * snapshot (§13). Render caps (500/group, 5,000/pane) affect rendering only;
 * deep links resolve against the full stored tree (§4a).
 */
export function TreePane({
  owner,
  repo,
  pane,
  selectedPath,
}: {
  owner: string
  repo: string
  pane: TreePaneModel
  selectedPath: string
}) {
  if (pane.totalBlobs === 0) {
    // Empty tree (§10) — a calm resting state, never an error.
    return (
      <nav className="files-tree" aria-label="Snapshot file tree">
        <div className="empty-state" style={{ marginTop: 0, padding: "40px 20px" }}>
          <div className="empty-title">This snapshot&apos;s tree is empty.</div>
          <p className="empty-body">
            Re-importing the repository refreshes its snapshot.
          </p>
          <div>
            <Link className="btn btn-primary" href="/import">
              Re-import to refresh
            </Link>
          </div>
        </div>
      </nav>
    )
  }

  return (
    <nav className="files-tree" aria-label="Snapshot file tree">
      {pane.capped && (
        <p className="files-tree-banner">
          Large tree: listing {formatCount(pane.renderedCount)} of{" "}
          {formatCount(pane.totalBlobs)} entries.
        </p>
      )}

      {pane.rootRows.length > 0 && (
        <ul className="files-entry-list" aria-label="Root-level files">
          {pane.rootRows.map((row) => (
            <TreeEntryRow
              key={row.path}
              owner={owner}
              repo={repo}
              row={row}
              selected={row.path === selectedPath}
            />
          ))}
          {pane.rootHiddenCount > 0 && (
            <li className="files-entry-more">
              … {formatCount(pane.rootHiddenCount)} more entries not shown.
            </li>
          )}
        </ul>
      )}

      {pane.groups.map((group) =>
        group.listed ? (
          <details
            key={group.name}
            className="files-group"
            open={group.open}
          >
            <summary>
              <span className="files-group-name">{group.name}/</span>
              <span className="files-group-count">
                · {formatCount(group.blobCount)}{" "}
                {group.blobCount === 1 ? "file" : "files"}
              </span>
            </summary>
            <ul className="files-entry-list">
              {group.rows.map((row) => (
                <TreeEntryRow
                  key={row.path}
                  owner={owner}
                  repo={repo}
                  row={row}
                  selected={row.path === selectedPath}
                />
              ))}
              {group.hiddenCount > 0 && (
                <li className="files-entry-more">
                  … {formatCount(group.hiddenCount)} more entries not shown.
                </li>
              )}
            </ul>
          </details>
        ) : (
          <p key={group.name} className="files-group-unlisted">
            <span className="mono">{group.name}/</span> ·{" "}
            {formatCount(group.blobCount)}{" "}
            {group.blobCount === 1 ? "file" : "files"} — not listed
          </p>
        ),
      )}
    </nav>
  )
}
