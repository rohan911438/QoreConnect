/** Code review: a broadcast resent after a dropped connection must not report an accepted transaction as failed. */
import { describe, expect, it } from 'vitest'
import { DIANA, RestBroadcaster, txHashOf } from '../src/index'

const bytes = new Uint8Array([1, 2, 3, 4])
const HASH = txHashOf(bytes)

function chain(submitCode: number, txhash = '') {
  const calls: string[] = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`)
    if (init?.method === 'POST') return new Response(JSON.stringify({ tx_response: { code: submitCode, txhash, raw_log: submitCode ? 'tx already exists in cache' : '' } }))
    if (url.endsWith(`/txs/${HASH}`)) return new Response(JSON.stringify({ tx_response: { code: 0, height: '7', gas_used: '1', gas_wanted: '2', events: [] } }))
    return new Response('{}', { status: 404 })
  }) as any
  return { calls, b: new RestBroadcaster(DIANA, { fetch: fetchImpl, pollMs: 1, timeoutMs: 2_000 }) }
}

describe('RestBroadcaster', () => {
  it('txHashOf is SHA-256 of the signed bytes, upper-case hex', () => {
    expect(HASH).toBe('9F64A747E1B97F131FABB6B447296C9B6F0201E79FB3C5356E6C77E89B6A806A')
  })

  it('"already in mempool/cache" (code 19) waits for the first copy by its local hash instead of failing', async () => {
    const { b, calls } = chain(19)
    const r = await b.broadcast(bytes)
    expect(r).toMatchObject({ code: 0, transactionHash: HASH, height: 7 })
    expect(calls.some((c) => c.startsWith('GET') && c.endsWith(HASH))).toBe(true)
  })

  it('other refusals still throw with the chain code', async () => {
    const { b } = chain(5, HASH)
    await expect(b.broadcast(bytes)).rejects.toMatchObject({ chainCode: 5 })
  })
})
