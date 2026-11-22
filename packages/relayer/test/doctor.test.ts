import { describe, expect, it } from 'vitest'
import { DIANA, type AuthenticatorInfo, type SpendingRuleInfo } from '@qoreconnect/core'
import { RelayerStore, SponsorService, allowListCovers, createRelayerApp, normaliseAccount, runDoctor, type DoctorChain, type Tank } from '../src/index'

const ACCOUNT = 'qor10z0spuhkwp0dzr0sx4rhl3ed83z8pe8yk9848s'
const TIPJAR = '0x42653b89eff2a993cf2767fedef783366f53aea4'
const DRAINER = '0x36003c3cea4a8e38cff894cce2c1d1be94e23baa'
const NOW = Date.UTC(2026, 10, 21, 12)
const mmKey = (p: Partial<AuthenticatorInfo> = {}): AuthenticatorInfo => ({
  scheme: 'secp256k1',
  pubkeyHex: '02' + 'ab'.repeat(32),
  permissions: ['evm'],
  expiryUnix: NOW / 1000 + 86_400,
  label: 'metamask',
  createdAtUnix: 0,
  revoked: false,
  hasSpendRule: true,
  ...p,
})
const rule = (p: Partial<SpendingRuleInfo> = {}): SpendingRuleInfo => ({
  id: 'qoreconnect',
  enabled: true,
  perTxLimit: 1_000_000n,
  dailyLimit: 5_000_000n,
  allowedDenoms: ['uqor'],
  allowedEvmCalls: [TIPJAR],
  denomLimits: [],
  ...p,
})
const chain = (s: { registered?: boolean; keys?: AuthenticatorInfo[]; rules?: SpendingRuleInfo[]; window?: boolean } = {}): DoctorChain => ({
  getPqcKey: async () => ({ registered: s.registered ?? true, possessionProven: true }),
  getEvmWindow: async () => ({ open: s.window ?? false }),
  getAuthenticators: async () => s.keys ?? [mmKey()],
  getSpendingRules: async () => s.rules ?? [rule()],
})
const tank: Tank = { id: 'demo-dapp', name: 'Quantum Tip Jar', owner: 'x', balanceUqor: 10_000_000n, perUserDailyCapUqor: 1n, paused: false }
const run = (c: DoctorChain, target?: string, getTank = (id: string) => (id === 'demo-dapp' ? tank : undefined)) =>
  runDoctor(c, { address: ACCOUNT, target, tankId: 'demo-dapp' }, { getTank, now: NOW })
const order = ['pqc-key', 'evm-window', 'linked-key', 'rule', 'target', 'tank']

describe('Doctor (Flow G): first failure and fix', () => {
  it('fresh address (no key): onboard, everything after it skipped', async () => {
    const r = await run(chain({ registered: false, keys: [], rules: [] }), TIPJAR)
    expect(r.healthy).toBe(false)
    expect(r.firstFailure).toMatchObject({ id: 'pqc-key', fix: { kind: 'onboard' } })
    expect(r.checks.map((c) => c.id)).toEqual(order)
    expect(r.checks.slice(1).every((c) => c.status === 'skip')).toBe(true)
  })

  it('linked but expired: renew, with the expiry time', async () => {
    const r = await run(chain({ keys: [mmKey({ expiryUnix: NOW / 1000 - 3600 })] }), TIPJAR)
    expect(r.firstFailure).toMatchObject({ id: 'linked-key', fix: { kind: 'renew' } })
    expect(r.firstFailure!.detail).toContain('expired on 2026-11-21 11:00')
    expect(r.checks.map((c) => c.status)).toEqual(['pass', 'info', 'fail', 'skip', 'skip', 'skip'])
  })

  it('never linked or revoked: link', async () => {
    expect((await run(chain({ keys: [] }))).firstFailure).toMatchObject({ id: 'linked-key', fix: { kind: 'link' } })
    const revoked = await run(chain({ keys: [mmKey({ revoked: true })] }))
    expect(revoked.firstFailure).toMatchObject({ id: 'linked-key', fix: { kind: 'link' } })
    expect(revoked.firstFailure!.detail).toContain('revoked')
  })

  it('no rule bounding every denom: set default limits', async () => {
    expect((await run(chain({ rules: [] }))).firstFailure).toMatchObject({ id: 'rule', fix: { kind: 'set-rule' } })
    const unbounded = rule({ perTxLimit: 0n, dailyLimit: 0n, allowedDenoms: ['uqor'], denomLimits: [] })
    expect((await run(chain({ rules: [unbounded] }))).firstFailure).toMatchObject({ id: 'rule' })
    expect((await run(chain({ rules: [rule({ enabled: false })] }))).firstFailure).toMatchObject({ id: 'rule' })
  })

  it('contract not approved: approve this dApp', async () => {
    const r = await run(chain(), DRAINER)
    expect(r.firstFailure).toMatchObject({ id: 'target', fix: { kind: 'approve' } })
    expect(r.firstFailure!.detail).toContain('code 10')
    expect(r.checks.at(-1)!.status).toBe('skip')
  })

  it('gas tank empty, paused or missing: contact the dApp', async () => {
    expect((await run(chain(), TIPJAR, () => ({ ...tank, balanceUqor: 0n }))).firstFailure).toMatchObject({ id: 'tank', fix: { kind: 'contact-dapp' } })
    expect((await run(chain(), TIPJAR, () => ({ ...tank, paused: true }))).firstFailure!.detail).toContain('paused')
    expect((await run(chain(), TIPJAR, () => undefined)).firstFailure!.detail).toContain('does not exist')
  })

  it('healthy: every check passes; the EVM window is informational only', async () => {
    const r = await run(chain(), TIPJAR)
    expect(r.healthy).toBe(true)
    expect(r.firstFailure).toBeUndefined()
    expect(r.checks.map((c) => c.status)).toEqual(['pass', 'info', 'pass', 'pass', 'pass', 'pass'])
  })

  it('accepts the 0x form of the account and validates input', async () => {
    const { evmAddress } = normaliseAccount(ACCOUNT)
    const r = await runDoctor(chain(), { address: evmAddress.toUpperCase().replace('0X', '0x') }, { now: NOW })
    expect(r.account).toBe(ACCOUNT)
    expect(r.checks.find((c) => c.id === 'target')!.status).toBe('skip')
    await expect(runDoctor(chain(), { address: 'hello' })).rejects.toThrow(/qor1/)
    await expect(runDoctor(chain(), { address: ACCOUNT, target: '0x12' })).rejects.toThrow(/target/)
  })

  it('allow-list matching is the same as the relayer and the chain (code review)', () => {
    expect(allowListCovers([`${TIPJAR}/0x12345678`], TIPJAR, '0x12345678')).toBe(true)
    expect(allowListCovers([`${TIPJAR}/0x12345678`], TIPJAR, '0xdeadbeef')).toBe(false)
    // A selector-scoped entry does not cover the whole contract.
    expect(allowListCovers([`${TIPJAR}/0x12345678`], TIPJAR)).toBe(false)
    // An empty allow-list allows any target.
    expect(allowListCovers([], TIPJAR, '0xdeadbeef')).toBe(true)
    expect(allowListCovers([TIPJAR.toUpperCase().replace('0X', '0x')], TIPJAR, '0xdeadbeef')).toBe(true)
  })

  it('HTTP: 400 on bad input', async () => {
    const app = createRelayerApp({ net: DIANA, store: new RelayerStore(':memory:'), sponsor: {} as SponsorService })
    expect((await app.request('/v1/doctor/hello')).status).toBe(400)
  })
})
