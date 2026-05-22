// Small formatting helpers shared by the M8 Diff Review components.

/** A short relative time for an ISO timestamp, e.g. `3d ago`. */
export function relTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return "just now"
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.round(diff / 86400)}d ago`
  return d.toLocaleDateString()
}

/** kebab-case slug — used to build stable in-page anchor ids for files. */
export function slugify(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** The DOM id for a changed file's entry — risks/questions anchor to it. */
export function fileAnchorId(path: string): string {
  return `file-${slugify(path)}`
}
