import { redirect } from "next/navigation"

/**
 * `/repos` has no index of its own yet — repo-scoped areas (issues,
 * challenges, portfolio, delivery, observability) are entered per-repo
 * after an import. Until a real repos hub exists (scoped follow-up of
 * epic #255), the nav's Repos entry lands on the import flow.
 */
export default function ReposIndexPage() {
  redirect("/import")
}
