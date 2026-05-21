import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"

import "./import.css"

const importSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-import-sans",
})

const importMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-import-mono",
})

export default function ImportLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${importSans.variable} ${importMono.variable}`}>
      {children}
    </div>
  )
}
