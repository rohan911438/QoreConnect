import { NextResponse, type NextRequest } from 'next/server'
import { vaultCsp } from './lib/csp'

/**
 * Vault pages get a per-request script nonce (T17). Next reads the nonce from the request's CSP header and puts it
 * on its own scripts; anything injected without it (XSS) does not run.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID())
  const policy = vaultCsp(nonce)
  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)
  headers.set('Content-Security-Policy', policy)
  const res = NextResponse.next({ request: { headers } })
  res.headers.set('Content-Security-Policy', policy)
  return res
}

export const config = {
  matcher: [
    { source: '/', missing: [{ type: 'header', key: 'next-router-prefetch' }] },
    { source: '/account/:path*', missing: [{ type: 'header', key: 'next-router-prefetch' }] },
    { source: '/dev/:path*', missing: [{ type: 'header', key: 'next-router-prefetch' }] },
  ],
}
