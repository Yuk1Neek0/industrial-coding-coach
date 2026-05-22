import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"

import "./recommend.css"

const recommendSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-recommend-sans",
})

const recommendMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-recommend-mono",
})

export default function RecommendLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${recommendSans.variable} ${recommendMono.variable}`}>
      {children}
    </div>
  )
}
