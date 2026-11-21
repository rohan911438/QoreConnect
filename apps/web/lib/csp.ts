/**
 * Content-Security-Policy (architecture/06, T17). No third-party scripts anywhere.
 * Vault pages (where the root seed is decrypted) get a per-request nonce for scripts (proxy.ts); every other page
 * gets the same policy with 'self' scripts plus Next's inline bootstrap. connect-src lists exactly the origins
 * the client talks to: QoreChain EVM RPC, the relayer, 4byte.directory (preview fallback) and a local agent.
 */
const RELAYER = process.env.NEXT_PUBLIC_RELAYER_URL ?? 'http://localhost:8787'
const origin = (u: string) => {
  try {
    return new URL(u).origin
  } catch {
    return ''
  }
}

export const CONNECT_SRC = [
  "'self'",
  'https://evm-testnet.qore.host',
  origin(RELAYER),
  'https://www.4byte.directory',
  // The example agent runs on the owner's machine (examples/agent, default :8790).
  'http://localhost:8790',
  'http://127.0.0.1:8790',
]
  .filter(Boolean)
  .join(' ')

const dev = process.env.NODE_ENV !== 'production'

export function csp(scriptSrc: string): string {
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${CONNECT_SRC}${dev ? ' ws: http://localhost:*' : ''}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ]
    .filter((d) => !(dev && d === 'upgrade-insecure-requests'))
    .join('; ')
}

/** Non-vault pages: Next's inline bootstrap scripts are allowed; no external script origins. */
export const BASE_CSP = csp("'self' 'unsafe-inline'")

/** Vault pages: only same-origin scripts and Next's scripts carrying this request's nonce. */
export const vaultCsp = (nonce: string) => csp(`'self' 'nonce-${nonce}'`)

export const SECURITY_HEADERS = [
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), publickey-credentials-get=(self), publickey-credentials-create=(self)' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
]

/** Pages that unlock the root vault. */
export const VAULT_PATHS = ['/', '/account', '/dev/vault']
