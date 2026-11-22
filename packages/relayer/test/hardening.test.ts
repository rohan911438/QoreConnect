/** P13: input size limits, timeouts, rate limits and low-balance alerts, verified by tests. */
import { describe, expect, it, vi } from 'vitest'
import { DIANA, HTTP_TIMEOUT_MS, QoreClient, httpConfig } from '@qoreconnect/core'
import { MAX_BODY_BYTES, RelayerStore, SponsorService, createRelayerApp } from '../src/index'

const app = (over: Partial<Parameters<typeof createRelayerApp>[0]> = {}) =>
  createRelayerApp({ net: DIANA, store: new RelayerStore(':memory:'), sponsor: { sponsor: async () => ({ ok: false, status: 400, error: 'x' }) } as unknown as SponsorService, ...over })

describe('relayer hardening', () => {
  it('rejects bodies over the size limit with 413 before parsing', async () => {
    const big = JSON.stringify({ data: '0x' + 'ab'.repeat(MAX_BODY_BYTES) })
    for (const path of ['/v1/relay', '/v1/sponsor', '/v1/tanks']) {
      const r = await app().request(path, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': String(big.length) }, body: big })
      expect(r.status, path).toBe(413)
    }
    // A normal-size body still reaches the handler.
    const ok = await app().request('/v1/sponsor', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(ok.status).toBe(400)
  })

  it('/health reports low relayer or sponsor balances as alerts (never secrets)', async () => {
    vi.spyOn(QoreClient.prototype, 'getLatestHeight').mockResolvedValue(100)
    vi.spyOn(QoreClient.prototype, 'getBalance').mockImplementation(async (a: string) => (a === 'qor1relayer' ? 500_000n : 9_000_000n))
    const h: any = await (await app({ accounts: { relayer: 'qor1relayer', sponsor: 'qor1sponsor' } }).request('/health')).json()
    expect(h.status).toBe('degraded')
    expect(h.alerts).toEqual(['relayer balance low (500000 uqor < 2000000)'])
    expect(JSON.stringify(h)).not.toMatch(/mnemonic|private|secret|token/i)
    vi.spyOn(QoreClient.prototype, 'getBalance').mockResolvedValue(9_000_000n)
    expect(((await (await app({ accounts: { relayer: 'r', sponsor: 's' } }).request('/health')).json()) as any).status).toBe('healthy')
    vi.restoreAllMocks()
  })

  it('a hung chain REST call times out instead of hanging the request', async () => {
    const saved = httpConfig.timeoutMs
    httpConfig.timeoutMs = 50
    let aborted = false
    const hang = ((_u: string, init?: RequestInit) =>
      new Promise((_res, rej) => init?.signal?.addEventListener('abort', () => ((aborted = true), rej(init.signal!.reason))))) as any
    const t0 = Date.now()
    await expect(new QoreClient(DIANA, hang).getLatestHeight()).rejects.toThrow()
    httpConfig.timeoutMs = saved
    expect(aborted).toBe(true)
    expect(Date.now() - t0).toBeLessThan(2000)
    expect(HTTP_TIMEOUT_MS).toBe(15_000)
  })

  it('the Doctor endpoint is rate limited per IP', async () => {
    const a = app()
    const codes: number[] = []
    for (let i = 0; i < 32; i++) codes.push((await a.request('/v1/doctor/hello', { headers: { 'x-forwarded-for': '9.9.9.9' } })).status)
    expect(codes.slice(0, 30).every((c) => c === 400)).toBe(true)
    expect(codes.slice(30)).toEqual([429, 429])
  })

  it('a client cannot pick its own rate-limit bucket with X-Forwarded-For (code review)', async () => {
    // Default (no trusted proxy): the header is ignored, so 32 different spoofed IPs still share one bucket.
    const direct = app()
    const codes: number[] = []
    for (let i = 0; i < 32; i++) codes.push((await direct.request('/v1/doctor/hello', { headers: { 'x-forwarded-for': `10.0.0.${i}` } })).status)
    expect(codes.slice(30)).toEqual([429, 429])
    // One trusted proxy: the address it appended (rightmost) counts; whatever the client put on the left is ignored.
    const proxied = app({ trustProxyHops: 1 })
    const p: number[] = []
    for (let i = 0; i < 32; i++) p.push((await proxied.request('/v1/doctor/hello', { headers: { 'x-forwarded-for': `6.6.6.${i}, 9.9.9.9` } })).status)
    expect(p.slice(30)).toEqual([429, 429])
    // ...and two genuinely different clients behind that proxy get separate buckets.
    expect((await proxied.request('/v1/doctor/hello', { headers: { 'x-forwarded-for': '8.8.8.8' } })).status).toBe(400)
  })
})
