import { NextRequest, NextResponse } from 'next/server'
import { isProxyPathAllowed } from '@qoreconnect/core'

/**
 * Same-origin proxy to QoreChain REST (public REST has no CORS).
 * GET: read-only allow-listed prefixes. POST: only simulate and broadcast of already-signed tx bytes.
 * The proxy never sees a private key: transactions are signed in the browser.
 */
const UPSTREAM = process.env.QORE_REST ?? 'https://api-testnet.qore.host'
const MAX_BODY = 512 * 1024

function target(req: NextRequest, path: string[]) {
  const p = '/' + path.map(encodeURIComponent).join('/')
  return { p, url: `${UPSTREAM}${p}${req.nextUrl.search}` }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { p, url } = target(req, (await ctx.params).path)
  if (!isProxyPathAllowed(p, 'GET')) {
    return NextResponse.json({ error: 'path not allowed' }, { status: 403 })
  }
  const r = await fetch(url, { headers: { accept: 'application/json' }, cache: 'no-store' })
  const body = await r.text()
  const cacheable = p.startsWith('/qorechain/pqc/v1/protocol_features') || p.startsWith('/qorechain/pqc/v1/evm_limits')
  return new NextResponse(body, {
    status: r.status,
    headers: { 'content-type': 'application/json', 'cache-control': cacheable ? 'public, max-age=60' : 'no-store' },
  })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { p, url } = target(req, (await ctx.params).path)
  if (!isProxyPathAllowed(p, 'POST')) return NextResponse.json({ error: 'path not allowed' }, { status: 403 })
  const text = await req.text()
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'body too large' }, { status: 413 })
  let parsed: any
  try {
    parsed = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (typeof parsed?.tx_bytes !== 'string') return NextResponse.json({ error: 'tx_bytes required' }, { status: 400 })
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx_bytes: parsed.tx_bytes, mode: parsed.mode }) })
  return new NextResponse(await r.text(), { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}
