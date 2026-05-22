import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"

import "./map.css"

const mapSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-map-sans",
})

const mapMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-map-mono",
})

export default function MapLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${mapSans.variable} ${mapMono.variable}`}>{children}</div>
  )
}
