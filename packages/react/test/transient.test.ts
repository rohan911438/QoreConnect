import { describe, expect, it } from 'vitest'
import { isTransient } from '../src/onboarding/OnboardingModal'

describe('onboarding auto-retry classification (P14)', () => {
  it('retries testnet hiccups', () => {
    expect(isTransient(new DOMException('The operation timed out.', 'TimeoutError'))).toBe(true)
    expect(isTransient(new Error('signal timed out'))).toBe(true)
    expect(isTransient(new TypeError('fetch failed'))).toBe(true)
    expect(isTransient(Object.assign(new Error('Transaction was not included in time'), { code: 'TX_FAILED' }))).toBe(
      true,
    )
    expect(isTransient(new Error('HTTP 503 for https://x: unavailable'))).toBe(true)
  })
  it('never retries what the user or the chain refused', () => {
    expect(isTransient(Object.assign(new Error('User rejected the request'), { code: 'USER_REJECTED' }))).toBe(false)
    expect(isTransient(Object.assign(new Error('timed out'), { code: 'LIMIT_EXCEEDED' }))).toBe(false)
    expect(isTransient(new Error('insufficient funds'))).toBe(false)
    expect(isTransient(new Error('HTTP 400 for https://x: bad request'))).toBe(false)
  })
})
