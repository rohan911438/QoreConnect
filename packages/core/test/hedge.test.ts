import { afterEach, describe, expect, it } from 'vitest'
import { getJson, hedgedFetch, httpConfig, type FetchLike } from '../src/chain/http'

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
/** A fetch whose n-th call (0-based) resolves after delays[n] ms, or hangs until aborted when delays[n] is Infinity. */
function scripted(delays: number[]) {
  const calls: AbortSignal[] = []
  const fetch: FetchLike = (_url, init) =>
    new Promise((resolve, reject) => {
      const n = calls.length
      calls.push(init!.signal!)
      init!.signal!.addEventListener('abort', () =>
        reject(init!.signal!.reason ?? new DOMException('aborted', 'AbortError')),
      )
      const d = delays[n] ?? 0
      if (Number.isFinite(d)) setTimeout(() => resolve(ok({ n })), d)
    })
  return { fetch, calls }
}

describe('hedged requests (P14)', () => {
  const saved = { ...httpConfig }
  afterEach(() => Object.assign(httpConfig, saved))

  it('does not hedge a fast request', async () => {
    const s = scripted([5])
    const r = await hedgedFetch(s.fetch, 'u', undefined, 1000, 100)
    expect(await r.json()).toEqual({ n: 0 })
    await new Promise((r) => setTimeout(r, 150))
    expect(s.calls).toHaveLength(1)
  })

  it('a hung request is beaten by the hedge, and the hung one is aborted', async () => {
    const s = scripted([Infinity, 10])
    const t0 = Date.now()
    const r = await hedgedFetch(s.fetch, 'u', undefined, 5000, 50)
    expect(await r.json()).toEqual({ n: 1 })
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(s.calls[0]!.aborted).toBe(true)
  })

  it('the primary still wins if it answers before the hedge', async () => {
    const s = scripted([80, Infinity])
    const r = await hedgedFetch(s.fetch, 'u', undefined, 5000, 50)
    expect(await r.json()).toEqual({ n: 0 })
    expect(s.calls[1]!.aborted).toBe(true)
  })

  it('times out when both attempts hang', async () => {
    const s = scripted([Infinity, Infinity])
    await expect(hedgedFetch(s.fetch, 'u', undefined, 120, 30)).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('getJson recovers from a hung request through the hedge', async () => {
    Object.assign(httpConfig, { timeoutMs: 5000, hedgeMs: 40 })
    const s = scripted([Infinity, 5])
    expect(await getJson('u', s.fetch)).toEqual({ n: 1 })
  })
})
