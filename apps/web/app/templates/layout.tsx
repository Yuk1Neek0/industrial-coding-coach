import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"

import "./templates.css"

const registrySans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-registry-sans",
})

const registryMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-registry-mono",
})

export default function TemplatesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${registrySans.variable} ${registryMono.variable}`}>
      {children}
    </div>
  )
}
