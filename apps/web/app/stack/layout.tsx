import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"

import "./stack.css"

const stackSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-stack-sans",
})

const stackMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-stack-mono",
})

export default function StackLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${stackSans.variable} ${stackMono.variable}`}>
      {children}
    </div>
  )
}
