import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"

import "./reviews.css"

// IBM Plex — the same type family the M5 Stack pages use, so the M8 Diff
// Review pages read as one product with the rest of the app.

const reviewsSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-reviews-sans",
})

const reviewsMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-reviews-mono",
})

export default function ReviewsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className={`${reviewsSans.variable} ${reviewsMono.variable}`}>
      {children}
    </div>
  )
}
