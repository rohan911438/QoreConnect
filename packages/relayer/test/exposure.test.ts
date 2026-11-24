import { describe, expect, it } from 'vitest'
import type { AuthenticatorInfo, SpendingRuleInfo } from '@rohankumar4179/core'
import { gradeOf, runExposure, type ExposureChain } from '../src/exposure'

const ADDR = 'qor1wpae9a38v7vlj2xvun2cw0669w4ls568zar4w8'
const NOW = Date.UTC(2026, 10, 22, 12) // 22 Nov 2026
const nowS = NOW / 1000
const DAY = 86_400

const key = (over: Partial<AuthenticatorInfo> = {}): AuthenticatorInfo => ({
  scheme: 'secp256k1',
  pubkeyHex: '02ab',
  permissions: [],
  expiryUnix: nowS + 7 * DAY,
  label: 'metamask',
  createdAtUnix: nowS - DAY,
  revoked: false,
  hasSpendRule: true,
  ...over,
})
const rule = (dailyLimit: bigint): SpendingRuleInfo => ({
  id: 'r1',
  enabled: true,
  perTxLimit: 1_000_000n,
  dailyLimit,
  allowedDenoms: ['uqor'],
  allowedEvmCalls: [],
  denomLimits: [{ denom: 'uqor', perTxLimit: '1000000', dailyLimit: dailyLimit.toString() }],
})

function chain(over: Partial<ExposureChain> & { balance?: bigint } = {}): ExposureChain {
  return {
    getBalance: async () => over.balance ?? 100_000_000n,
    getPqcKey: async () => ({ registered: true, possessionProven: true }),
    getPqcParams: async () => ({ hybridSignatureMode: 'required', allowClassicalFallback: false, pqcPrimary: true }),
    getAccountPubkey: async () => ({ exists: true, pubkeyType: '/cosmos.evm.crypto.v1.ethsecp256k1.PubKey' }),
    getAuthenticators: async () => [],
    getSpendingRules: async () => [],
    getEvmNonce: async () => 0,
    ...over,
  }
}

describe('Q-Day exposure report', () => {
  it('grades by score bands', () => {
    expect([100, 90, 89, 75, 50, 49, 25, 24, 0].map(gradeOf)).toEqual(['A', 'A', 'B', 'B', 'C', 'D', 'D', 'F', 'F'])
  })

  it('unused address: nothing at risk, no score', async () => {
    const r = await runExposure(
      chain({
        balance: 0n,
        getPqcKey: async () => ({ registered: false, possessionProven: false }),
        getAccountPubkey: async () => ({ exists: false }),
      }),
      { address: ADDR },
      { now: NOW },
    )
    expect(r.status).toBe('empty')
    expect(r.score).toBeUndefined()
    expect(r.nextStep?.kind).toBe('onboard')
  })

  it('no PQC key and public key revealed: the whole balance is claimable', async () => {
    const r = await runExposure(
      chain({ getPqcKey: async () => ({ registered: false, possessionProven: false }) }),
      { address: ADDR },
      { now: NOW },
    )
    expect(r.status).toBe('claimable')
    expect(r.atRiskUqor).toBe('100000000')
    expect(r.grade).toBe('F')
    expect(r.exposedBy).toEqual(['cosmos-tx'])
    expect(r.headline).toContain('100 QOR')
  })

  it('an EVM transaction also reveals the key', async () => {
    const r = await runExposure(
      chain({
        getPqcKey: async () => ({ registered: false, possessionProven: false }),
        getAccountPubkey: async () => ({ exists: true }),
        getEvmNonce: async () => 3,
      }),
      { address: ADDR },
      { now: NOW },
    )
    expect(r.status).toBe('claimable')
    expect(r.exposedBy).toEqual(['evm-tx'])
  })

  it('no PQC key, never signed: hidden until the first transaction', async () => {
    const r = await runExposure(
      chain({
        getPqcKey: async () => ({ registered: false, possessionProven: false }),
        getAccountPubkey: async () => ({ exists: true }),
      }),
      { address: ADDR },
      { now: NOW },
    )
    expect(r.status).toBe('hidden')
    expect(r.grade).toBe('D')
    expect(r.publicKeyExposed).toBe(false)
  })

  it('PQC root and no classical keys: fully protected, even with the classical key revealed', async () => {
    const r = await runExposure(chain(), { address: ADDR }, { now: NOW })
    expect(r).toMatchObject({ status: 'protected', score: 100, grade: 'A', atRiskUqor: '0', publicKeyExposed: true })
  })

  it('revoked and expired keys do not count', async () => {
    const r = await runExposure(
      chain({ getAuthenticators: async () => [key({ revoked: true }), key({ expiryUnix: nowS - 10 })] }),
      { address: ADDR },
      { now: NOW },
    )
    expect(r.status).toBe('protected')
  })

  it('capped key: worst case is daily limit × days left, never more than the balance', async () => {
    const r = await runExposure(
      chain({ getAuthenticators: async () => [key()], getSpendingRules: async () => [rule(1_000_000n)] }),
      { address: ADDR },
      { now: NOW },
    )
    expect(r.status).toBe('capped')
    expect(r.atRiskPerDayUqor).toBe('1000000')
    expect(r.atRiskUqor).toBe('7000000') // 1 QOR/day for 7 days
    expect(r.score).toBe(92) // 95 - round(40 * 0.07)
    expect(r.grade).toBe('A')
    const big = await runExposure(
      chain({
        balance: 3_000_000n,
        getAuthenticators: async () => [key()],
        getSpendingRules: async () => [rule(1_000_000n)],
      }),
      { address: ADDR },
      { now: NOW },
    )
    expect(big.atRiskUqor).toBe('3000000')
    expect(big.score).toBe(55)
    expect(big.nextStep?.kind).toBe('set-rule')
  })

  it('a key without expiry puts the whole balance in reach and costs points', async () => {
    const r = await runExposure(
      chain({
        getAuthenticators: async () => [key({ expiryUnix: 0 })],
        getSpendingRules: async () => [rule(1_000_000n)],
      }),
      { address: ADDR },
      { now: NOW },
    )
    expect(r.atRiskUqor).toBe('100000000')
    expect(r.score).toBe(45)
    expect(r.nextStep?.kind).toBe('set-expiry')
    expect(r.findings.map((f) => f.id)).toContain('no-expiry')
  })

  it('linked key without a rule asks for limits', async () => {
    const r = await runExposure(chain({ getAuthenticators: async () => [key()] }), { address: ADDR }, { now: NOW })
    expect(r).toMatchObject({ status: 'capped', score: 70, nextStep: { kind: 'set-rule' } })
  })

  it('never claims protection if the chain allows classical fallback', async () => {
    const r = await runExposure(
      chain({
        getPqcParams: async () => ({ hybridSignatureMode: 'optional', allowClassicalFallback: true, pqcPrimary: true }),
      }),
      { address: ADDR },
      { now: NOW },
    )
    expect(r.status).not.toBe('protected')
    expect(r.atRiskUqor).toBe('100000000')
    expect(r.findings[0]!.id).toBe('pqc-root-weak')
  })

  it('accepts a 0x address', async () => {
    const r = await runExposure(chain(), { address: '0x7073d2f627b3d9f9512cc2a587a75a2bab0c34f1' }, { now: NOW })
    expect(r.account).toMatch(/^qor1/)
  })
})
