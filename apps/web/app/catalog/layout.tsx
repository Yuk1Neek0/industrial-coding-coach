import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"

import "./catalog.css"

const catalogSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-catalog-sans",
})

const catalogMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-catalog-mono",
})

export default function CatalogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${catalogSans.variable} ${catalogMono.variable}`}>
      {children}
    </div>
  )
}
