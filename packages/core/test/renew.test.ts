import { describe, expect, it } from 'vitest'
import { DEFAULT_SESSION_TTL_S, LIMIT_PRESETS, renewTtlSeconds } from '../src'

describe('renew lifetime', () => {
  it('uses the matching preset lifetime', () => {
    for (const p of LIMIT_PRESETS) expect(renewTtlSeconds(p.perTxUqor, p.dailyUqor)).toBe(p.ttlDays * 86_400)
  })
  it('custom limits renew for the default 7 days', () => {
    expect(renewTtlSeconds(123n, 456n)).toBe(DEFAULT_SESSION_TTL_S)
  })
})
