import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { Header } from '../components/Header'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'QoreConnect',
  description: 'The migration layer for the migration year. Quantum-safe root, MetaMask convenience. Live on QoreChain Diana testnet.',
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Saved theme before paint (no flash); a same-origin file, so the CSP needs no inline script. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme.js" />
      </head>
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-panel focus:px-3 focus:py-2">
          Skip to content
        </a>
        <Providers>
          <Header />
          <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
            {children}
          </main>
          <footer className="mx-auto max-w-5xl px-4 pb-10 text-sm text-muted sm:px-6">
            QoreConnect runs on QoreChain Diana testnet (chain id qorechain-diana, EVM 9800). Built on QoreChain kits. Testnet funds have no value.
          </footer>
        </Providers>
      </body>
    </html>
  )
}
