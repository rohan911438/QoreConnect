import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Header } from '../components/Header'
import { Footer } from '../components/Footer'

// next/font downloads the fonts at build time and serves them from this origin, so the CSP (font-src 'self') holds.
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' })
const head = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-head',
  weight: ['500', '600', '700'],
  display: 'swap',
})
const code = JetBrains_Mono({ subsets: ['latin'], variable: '--font-code', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'QoreConnect',
  description:
    'The migration layer for the migration year. Quantum-safe root, MetaMask convenience. Live on QoreChain Diana testnet.',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${body.variable} ${head.variable} ${code.variable}`}>
      <head>
        {/* Saved theme before paint (no flash); a same-origin file, so the CSP needs no inline script. */}
        <script src="/theme.js" />
      </head>
      <body className="relative min-h-screen">
        <div aria-hidden="true" className="qw-aurora" />
        <div aria-hidden="true" className="qw-grid" />
        <div aria-hidden="true" className="qw-grain" />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <Providers>
          <Header />
          <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  )
}
