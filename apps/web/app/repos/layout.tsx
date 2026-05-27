import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"

import "./repos.css"

// IBM Plex — the same type family the M5 / M8 pages use, so the M7 Issue
// Learning Workspace pages read as one product with the rest of the app
// (issue-based-learning-workspace epic, task #138).

const reposSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-repos-sans",
})

const reposMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-repos-mono",
})

export default function ReposLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${reposSans.variable} ${reposMono.variable}`}>
      {children}
    </div>
  )
}
