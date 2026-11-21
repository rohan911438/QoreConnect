import { describe, expect, it } from 'vitest'
import {
  MANAGED_RULE_ID, NO_DAPP_SENTINEL, assertRuleInvariants, mergeApprove, mergeForLink, mergeLimits, mergeRemove, normaliseCall, RuleInvariantError, type Rule,
} from '../src/index'

const A = '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74'
const B = '0x5017fbbc1de44e698d1778630bce63741c1d0005'
const C = '0x1111111111111111111111111111111111111111'
const other: Rule = { id: 'treasury', enabled: true, perTxLimit: 9n, dailyLimit: 99n, allowedDenoms: ['uqor'], allowedEvmCalls: [C] }
const key = (o: Partial<{ revoked: boolean; permissions: string[]; expiryUnix: number }> = {}) => ({ pubkeyHex: '02ab', permissions: ['evm'], revoked: false, expiryUnix: 0, ...o })

describe('rule merge (G1: no rule lost)', () => {
  it('link creates the managed rule first and keeps other rules unchanged', () => {
    const r = mergeForLink([other], [A.toUpperCase().replace('0X', '0x')])
    expect(r[0]!.id).toBe(MANAGED_RULE_ID)
    expect(r[0]!.allowedEvmCalls).toEqual([A])
    expect(r[1]).toEqual(other)
  })
  it('approve adds a contract and keeps the first and every other rule', () => {
    const r = mergeApprove(mergeForLink([other], [A]), [B])
    expect(r[0]!.allowedEvmCalls).toEqual([A, B])
    expect(r).toHaveLength(2)
    expect(r[1]).toEqual(other)
  })
  it('approve is idempotent', () => {
    const r = mergeApprove(mergeApprove(mergeForLink([], [A]), [B]), [B, A])
    expect(r[0]!.allowedEvmCalls).toEqual([A, B])
  })
  it('removing one dApp removes only its contracts (including its selector entries)', () => {
    const r = mergeRemove(mergeApprove(mergeForLink([other], [A]), [B, `${B}/0xd09de08a`]), [B])
    expect(r[0]!.allowedEvmCalls).toEqual([A])
    expect(r[1]).toEqual(other)
  })
  it('removing the last dApp leaves the sentinel, never an empty allow-list', () => {
    const r = mergeRemove(mergeForLink([], [A]), [A])
    expect(r[0]!.allowedEvmCalls).toEqual([NO_DAPP_SENTINEL])
    const back = mergeApprove(r, [B])
    expect(back[0]!.allowedEvmCalls).toEqual([B])
  })
  it('setting limits changes only the managed rule', () => {
    const r = mergeLimits(mergeForLink([other], [A]), { perTxUqor: 2n, dailyUqor: 10n })
    expect(r[0]).toMatchObject({ perTxLimit: 2n, dailyLimit: 10n, allowedEvmCalls: [A] })
    expect(r[1]).toEqual(other)
  })
  it('rejects nonsense limits and malformed calls', () => {
    expect(() => mergeLimits(mergeForLink([], [A]), { perTxUqor: 0n, dailyUqor: 0n })).toThrow()
    expect(() => mergeLimits(mergeForLink([], [A]), { perTxUqor: 10n, dailyUqor: 5n })).toThrow()
    expect(() => normaliseCall('0x123')).toThrow()
    expect(() => normaliseCall(`${A}/0x12`)).toThrow()
    expect(normaliseCall(`${A.toUpperCase().replace('0X', '0x')}/0xD09DE08A`)).toBe(`${A}/0xd09de08a`)
  })
  it('a managed rule placed behind another enabled rule moves back to first', () => {
    const r = mergeApprove([other, { ...mergeForLink([], [A])[0]! }], [B])
    expect(r.map((x) => x.id)).toEqual([MANAGED_RULE_ID, 'treasury'])
  })
})

describe('assertRuleInvariants', () => {
  it('passes for a linked key under the managed rule', () => {
    expect(() => assertRuleInvariants({ rules: mergeForLink([], [A]), keys: [key()] })).not.toThrow()
  })
  it('fails when a value key has no enabled rule', () => {
    expect(() => assertRuleInvariants({ rules: [], keys: [key()] })).toThrow(RuleInvariantError)
  })
  it('fails when another rule would bound the key instead of ours', () => {
    expect(() => assertRuleInvariants({ rules: [other, ...mergeForLink([], [A])], keys: [key()] })).toThrow(/not the QoreConnect rule/)
  })
  it('fails for an unbounded rule or empty allow-list', () => {
    const m = mergeForLink([], [A])[0]!
    expect(() => assertRuleInvariants({ rules: [{ ...m, perTxLimit: 0n, dailyLimit: 0n }], keys: [key()] })).toThrow(/bound/)
    expect(() => assertRuleInvariants({ rules: [{ ...m, allowedEvmCalls: [] }], keys: [key()] })).toThrow(/empty/)
  })
  it('ignores revoked and expired keys', () => {
    expect(() => assertRuleInvariants({ rules: [], keys: [key({ revoked: true }), key({ expiryUnix: 1 })] })).not.toThrow()
  })
})
