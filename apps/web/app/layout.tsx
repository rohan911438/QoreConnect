import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = { title: 'QoreConnect', description: 'The migration layer for the migration year.' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>)
}
