import { connection } from 'next/server'

/** Vault page: rendered per request so every response carries a fresh CSP script nonce (proxy.ts, T17). */
export default async function VaultLayout({ children }: { children: React.ReactNode }) {
  await connection()
  return children
}
