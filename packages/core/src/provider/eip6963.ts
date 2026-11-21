import type { Eip1193Provider } from '../onboard'

/** QoreConnect mark: a shield with a lattice "Q" (inline SVG data URI, as EIP-6963 requires). */
export const QORECONNECT_ICON =
  'data:image/svg+xml;base64,' +
  (typeof btoa === 'function' ? btoa : (s: string) => Buffer.from(s, 'binary').toString('base64'))(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="22" fill="#0B0F14"/><path d="M48 14 76 25v21c0 18-12 30-28 36-16-6-28-18-28-36V25z" fill="none" stroke="#7CF2C4" stroke-width="5" stroke-linejoin="round"/><circle cx="48" cy="46" r="12" fill="none" stroke="#7CF2C4" stroke-width="5"/><path d="m55 53 9 9" stroke="#7CF2C4" stroke-width="5" stroke-linecap="round"/></svg>',
  )

export interface Eip6963Info {
  uuid: string
  name: string
  icon: string
  rdns: string
}

/** Announce a provider to EIP-6963 wallet pickers (RainbowKit, wagmi's injected discovery). Returns an unsubscribe. */
export function announceProvider(provider: Eip1193Provider, info: Partial<Eip6963Info> = {}): () => void {
  const w = globalThis as any
  if (typeof w.dispatchEvent !== 'function') return () => {}
  const detail = Object.freeze({
    info: Object.freeze({
      uuid: info.uuid ?? (globalThis.crypto?.randomUUID?.() ?? '00000000-0000-4000-8000-000000000000'),
      name: info.name ?? 'QoreConnect',
      icon: info.icon ?? QORECONNECT_ICON,
      rdns: info.rdns ?? 'xyz.qoreconnect',
    }),
    provider,
  })
  const announce = () => w.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }))
  announce()
  w.addEventListener('eip6963:requestProvider', announce)
  return () => w.removeEventListener('eip6963:requestProvider', announce)
}
