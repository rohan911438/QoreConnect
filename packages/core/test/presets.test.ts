import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LIMITS,
  DEFAULT_PRESET,
  DEFAULT_SESSION_TTL_S,
  LIMIT_PRESETS,
  describeLimits,
  matchPreset,
  presetById,
  presetExpiry,
  presetLimits,
} from '../src'

describe('limit presets', () => {
  it('Everyday equals the existing defaults, so current accounts show as Everyday', () => {
    const p = presetById(DEFAULT_PRESET)!
    expect(presetLimits(p)).toEqual(DEFAULT_LIMITS)
    expect(p.ttlDays * 86_400).toBe(DEFAULT_SESSION_TTL_S)
    expect(matchPreset(DEFAULT_LIMITS.perTxUqor, DEFAULT_LIMITS.dailyUqor)?.id).toBe('everyday')
  })

  it('every preset is internally consistent', () => {
    expect(new Set(LIMIT_PRESETS.map((p) => p.id)).size).toBe(LIMIT_PRESETS.length)
    for (const p of LIMIT_PRESETS) {
      expect(p.perTxUqor).toBeGreaterThan(0n)
      expect(p.perTxUqor).toBeLessThanOrEqual(p.dailyUqor)
      expect(p.ttlDays).toBeGreaterThanOrEqual(1)
      expect(p.ttlDays).toBeLessThanOrEqual(7)
    }
  })

  it('custom limits match no preset', () => {
    expect(matchPreset(123n, 456n)).toBeUndefined()
  })

  it('expiry is now + lifetime', () => {
    expect(presetExpiry(presetById('gaming')!, 1_000_000)).toBe(1000 + 3 * 86_400)
  })

  it('describes limits in plain English with exact amounts', () => {
    const d = describeLimits({ perTxUqor: 250_000n, dailyUqor: 1_000_000n, ttlDays: 1 }, { approvedDapps: 1 })
    expect(d.can).toEqual([
      'Send up to 0.25 QOR in one transaction',
      'Spend up to 1 QOR per day in total',
      'Call the 1 dApp you approved',
      'Work for 1 day after you link or renew it',
    ])
    expect(d.cannot[0]).toBe('Move more than 1 QOR in a day, even if MetaMask is stolen or broken')
    expect(describeLimits({ perTxUqor: 1n, dailyUqor: 2n }, { approvedDapps: 0 }).can[2]).toBe(
      'Call no dApp until you approve one',
    )
  })
})
