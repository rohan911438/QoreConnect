import { describe, expect, it } from 'vitest'
import { classifyChainRefusal, formatQor, parseQor, weiToUqor } from '../src/index'

describe('units', () => {
  it('formats and parses QOR', () => {
    expect(formatQor(1_500_000n)).toBe('1.5')
    expect(formatQor(66_000n)).toBe('0.066')
    expect(parseQor('2.25')).toBe(2_250_000n)
    expect(parseQor('3')).toBe(3_000_000n)
    expect(() => parseQor('1.1234567')).toThrow()
  })
  it('converts wei to uqor rounding up', () => {
    expect(weiToUqor(10n ** 18n)).toBe(1_000_000n)
    expect(weiToUqor(1n)).toBe(1n)
  })
})

describe('classifyChainRefusal (strings from P01)', () => {
  it('classifies', () => {
    expect(classifyChainRefusal('linked key is unbound or revoked', 10)).toBe('REVOKED')
    expect(classifyChainRefusal('evm call to 0xabc not in allowed_evm_calls', 10)).toBe('NOT_APPROVED')
    expect(classifyChainRefusal('spending limit exceeded: per-tx', 5)).toBe('LIMIT_EXCEEDED')
    expect(classifyChainRefusal('', 11)).toBe('NONCE')
  })
})
