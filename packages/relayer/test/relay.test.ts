import { describe, expect, it } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { encodeFunctionData, parseAbi } from 'viem'
import { DIANA, toRelayRequest, type AuthenticatorInfo, type SpendingRuleInfo, type TxResult } from '@qoreconnect/core'
import { buildMetaMaskExecuteEvm } from '@qorechain/sdk'
import { RelayService, RelayerStore, createRelayerApp, SponsorService, type RelayChain } from '../src/index'

const ACCOUNT = 'qor10z0spuhkwp0dzr0sx4rhl3ed83z8pe8yk9848s'
const COUNTER = '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74'
const OTHER = '0x5017fbbc1de44e698d1778630bce63741c1d0005'
const abi = parseAbi(['function increment()', 'function tip() payable'])
const QOR = 10n ** 18n

class MockChain implements RelayChain {
  relayerAddress = 'qor1zl9mfjhqksshzjpf7erp9nypadncfz3n42hct8'
  nonce = 0n
  submitted = 0
  revert = false
  outcome: { success: boolean; reason?: string } = { success: true }
  constructor(
    public keyHex: string,
    public rule: Partial<SpendingRuleInfo> = {},
    public key: Partial<AuthenticatorInfo> = {},
  ) {}
  async authNonce() {
    return this.nonce
  }
  async authenticators(): Promise<AuthenticatorInfo[]> {
    return [{ scheme: 'secp256k1', pubkeyHex: this.keyHex, permissions: ['evm'], expiryUnix: 0, label: '', createdAtUnix: 0, revoked: false, hasSpendRule: false, ...this.key }]
  }
  async rules(): Promise<SpendingRuleInfo[]> {
    return [{ id: 'qoreconnect', enabled: true, perTxLimit: 1_000_000n, dailyLimit: 5_000_000n, allowedDenoms: ['uqor'], allowedEvmCalls: [COUNTER], denomLimits: [], ...this.rule }]
  }
  async simulateCall() {
    return this.revert ? { ok: false as const, error: 'execution reverted' } : { ok: true as const }
  }
  async submit(): Promise<TxResult> {
    this.submitted++
    const events = this.outcome.success
      ? []
      : [{ type: 'abstractaccount_execution_failed', attributes: [{ key: 'account', value: ACCOUNT }, { key: 'lane', value: 'evm' }, { key: 'nonce', value: String(this.nonce) }, { key: 'reason', value: this.outcome.reason ?? '' }] }]
    // MsgExecuteEVMResponse { success = 1 (bool) }
    const value = this.outcome.success ? new Uint8Array([0x08, 0x01]) : new Uint8Array([])
    this.nonce++
    return { code: 0, transactionHash: 'AB'.repeat(32), height: 1, gasUsed: 1n, gasWanted: 1n, rawLog: '', events, msgResponses: [{ typeUrl: '/qorechain.abstractaccount.v1.MsgExecuteEVMResponse', value }], feeUqor: '97500' }
  }
}

async function signedRequest(pk: `0x${string}`, o: { to?: string; value?: bigint; data?: string; nonce?: bigint; gasLimit?: number } = {}) {
  const acct = privateKeyToAccount(pk)
  const provider = { request: async ({ params }: any) => acct.signMessage({ message: { raw: params[0] } }) }
  const msg = await buildMetaMaskExecuteEvm({
    provider: provider as any,
    address: acct.address,
    relayer: 'anything',
    chainId: DIANA.chainId,
    account: ACCOUNT,
    to: o.to ?? COUNTER,
    value: (o.value ?? 0n).toString(),
    data: Uint8Array.from(Buffer.from((o.data ?? encodeFunctionData({ abi, functionName: 'increment' })).slice(2), 'hex')),
    gasLimit: o.gasLimit ?? 200_000,
    nonce: o.nonce ?? 0n,
    digestVersion: 'v2',
  })
  return toRelayRequest(msg, 'demo-dapp')
}

function setup(rule?: Partial<SpendingRuleInfo>, key?: Partial<AuthenticatorInfo>, policy?: Partial<{ perAccountPerMinute: number; perIpPerMinute: number }>) {
  const pk = generatePrivateKey()
  const addr = privateKeyToAccount(pk).address.toLowerCase().slice(2)
  const store = new RelayerStore(':memory:')
  store.createTank({ id: 'demo-dapp', name: 'Demo', owner: ACCOUNT, balanceUqor: 10_000_000n, perUserDailyCapUqor: 2_000_000n })
  const chain = new MockChain(addr, rule, key)
  const svc = new RelayService(DIANA, store, chain, { perAccountPerMinute: 20, perIpPerMinute: 60, maxGasLimit: 3_000_000, ...policy })
  return { pk, store, chain, svc }
}

describe('RelayService pipeline', () => {
  it('relays a valid call, debits the tank and records it', async () => {
    const { pk, store, chain, svc } = setup()
    const out = await svc.relay(await signedRequest(pk), '1.1.1.1')
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({ ok: true, success: true, feeUqor: '97500' })
    expect(chain.submitted).toBe(1)
    expect(store.getTank('demo-dapp')!.balanceUqor).toBe(10_000_000n - 97_500n)
    expect(store.getRelay('AB'.repeat(32))).toMatchObject({ success: 1 })
  })

  it('rejects anything that is not a MsgExecuteEVM-shaped request', async () => {
    const { svc } = setup()
    const out = await svc.relay({ typeUrl: '/cosmos.bank.v1beta1.MsgSend' }, 'x')
    expect(out).toMatchObject({ status: 400, body: { code: 'INVALID_INPUT', preRejected: true } })
  })

  it('NONCE: stale nonce is refused without broadcasting', async () => {
    const { pk, chain, svc } = setup()
    chain.nonce = 3n
    const out = await svc.relay(await signedRequest(pk, { nonce: 2n }), 'x')
    expect(out.body).toMatchObject({ code: 'NONCE', chainCode: 11, preRejected: true })
    expect(chain.submitted).toBe(0)
  })

  it('LIMIT_EXCEEDED: value over per-tx limit is pre-rejected with chain code 5; tank not debited', async () => {
    const { pk, store, chain, svc } = setup({ allowedEvmCalls: [COUNTER] })
    const data = encodeFunctionData({ abi, functionName: 'tip' })
    const out = await svc.relay(await signedRequest(pk, { value: 2n * QOR, data }), 'x')
    expect(out.body).toMatchObject({ code: 'LIMIT_EXCEEDED', chainCode: 5, preRejected: true })
    expect(chain.submitted).toBe(0)
    expect(store.getTank('demo-dapp')!.balanceUqor).toBe(10_000_000n)
  })

  it('LIMIT_EXCEEDED on chain (daily): mapped from the failure reason; tank IS debited', async () => {
    const { pk, store, chain, svc } = setup()
    chain.outcome = { success: false, reason: 'spending limit exceeded: daily limit 5000000uqor' }
    const out = await svc.relay(await signedRequest(pk), 'x')
    expect(out.body).toMatchObject({ ok: true, success: false, code: 'LIMIT_EXCEEDED', chainCode: 5 })
    expect(store.getTank('demo-dapp')!.balanceUqor).toBe(10_000_000n - 97_500n)
  })

  it('NOT_APPROVED: contract outside the allow-list (code 10)', async () => {
    const { pk, svc, chain } = setup()
    const out = await svc.relay(await signedRequest(pk, { to: OTHER }), 'x')
    expect(out.body).toMatchObject({ code: 'NOT_APPROVED', chainCode: 10 })
    expect(chain.submitted).toBe(0)
  })

  it('selector-scoped allow-list entries are honoured', async () => {
    const sel = encodeFunctionData({ abi, functionName: 'increment' }).slice(0, 10)
    const { pk, svc } = setup({ allowedEvmCalls: [`${COUNTER}/${sel}`] })
    expect((await svc.relay(await signedRequest(pk), 'x')).body.success).toBe(true)
    const { pk: pk2, svc: svc2 } = setup({ allowedEvmCalls: [`${COUNTER}/0x12345678`] })
    expect((await svc2.relay(await signedRequest(pk2), 'x')).body.code).toBe('NOT_APPROVED')
  })

  it('REVOKED / EXPIRED keys are refused', async () => {
    const r = setup(undefined, { revoked: true })
    expect((await r.svc.relay(await signedRequest(r.pk), 'x')).body.code).toBe('REVOKED')
    const e = setup(undefined, { expiryUnix: 100 })
    expect((await e.svc.relay(await signedRequest(e.pk), 'x')).body).toMatchObject({ code: 'EXPIRED', chainCode: 6 })
  })

  it('a tampered request (signature for a different call) is refused locally', async () => {
    const { pk, svc, chain } = setup()
    const req = await signedRequest(pk)
    const out = await svc.relay({ ...req, gasLimit: '250000' }, 'x')
    expect(out.body).toMatchObject({ code: 'INVALID_INPUT' })
    expect(chain.submitted).toBe(0)
  })

  it('a call that would revert is refused before broadcast', async () => {
    const { pk, svc, chain } = setup()
    chain.revert = true
    expect((await svc.relay(await signedRequest(pk), 'x')).body).toMatchObject({ code: 'TX_FAILED', preRejected: true })
    expect(chain.submitted).toBe(0)
  })

  it('tank policy: unknown, paused, contract filter, per-user daily cap', async () => {
    const { pk, store, svc } = setup()
    const req = await signedRequest(pk)
    expect((await svc.relay({ ...req, tankId: 'nope' }, 'x')).status).toBe(404)
    store.updateTank('demo-dapp', { paused: true })
    expect((await svc.relay(req, 'x')).body.code).toBe('TANK_EMPTY')
    store.updateTank('demo-dapp', { paused: false, perUserDailyCapUqor: 50_000n })
    expect((await svc.relay(req, 'x')).body.code).toBe('RATE_LIMITED')
  })

  it('rate limits per account', async () => {
    const { pk, svc, chain } = setup(undefined, undefined, { perAccountPerMinute: 2 })
    expect((await svc.relay(await signedRequest(pk, { nonce: 0n }), 'x')).body.success).toBe(true)
    expect((await svc.relay(await signedRequest(pk, { nonce: 1n }), 'x')).body.success).toBe(true)
    const third = await svc.relay(await signedRequest(pk, { nonce: 2n }), 'x')
    expect(third).toMatchObject({ status: 429, body: { code: 'RATE_LIMITED' } })
    expect(chain.submitted).toBe(2)
  })

  it('code review: unsigned junk is rate limited by IP first and never recorded under the claimed account', async () => {
    const { pk, store, svc } = setup(undefined, undefined, { perIpPerMinute: 3 })
    const junk = { ...(await signedRequest(pk)), signature: '0x' + '11'.repeat(65), tankId: 'nope' }
    const statuses: number[] = []
    for (let i = 0; i < 5; i++) statuses.push((await svc.relay(junk, '6.6.6.6')).status)
    expect(statuses).toEqual([400, 400, 400, 429, 429])
    expect(store.accountActivity(ACCOUNT)).toHaveLength(0)
  })

  it('code review: the daily check counts what was already spent today', async () => {
    const { pk, svc, chain } = setup({ perTxLimit: 1_000_000n, dailyLimit: 1_500_000n })
    const data = encodeFunctionData({ abi, functionName: 'tip' })
    expect((await svc.relay(await signedRequest(pk, { value: QOR, data, nonce: 0n }), 'x')).body.success).toBe(true)
    const second = await svc.relay(await signedRequest(pk, { value: QOR, data, nonce: 1n }), 'x')
    expect(second.body).toMatchObject({ code: 'LIMIT_EXCEEDED', preRejected: true })
    expect(chain.submitted).toBe(1)
  })

  it('code review: parallel requests cannot overspend a per-user gas cap (in-flight fees are reserved)', async () => {
    const { pk, store, svc, chain } = setup()
    // Each relay's estimated envelope fee is 97,500 uqor: a 250,000 cap has room for exactly two.
    store.updateTank('demo-dapp', { perUserDailyCapUqor: 250_000n })
    const slow = chain.submit.bind(chain)
    chain.submit = async () => (await new Promise((r) => setTimeout(r, 30)), slow())
    chain.authNonce = async () => 0n // isolate the cap: every copy looks fresh at pre-check time
    const req = await signedRequest(pk)
    const out = await Promise.all([1, 2, 3].map(() => svc.relay({ ...req }, 'x')))
    expect(out.filter((o) => o.status === 200)).toHaveLength(2)
    expect(out.filter((o) => o.body.code === 'RATE_LIMITED')).toHaveLength(1)
  })

  it('code review: a broadcast that times out is still charged the estimated fee', async () => {
    const { pk, store, svc, chain } = setup()
    const { QoreConnectError } = await import('@qoreconnect/core')
    chain.submit = async () => {
      throw new QoreConnectError('TX_FAILED', { message: 'Transaction was not included in time', txHash: 'CD'.repeat(32) })
    }
    const out = await svc.relay(await signedRequest(pk), 'x')
    expect(out.status).toBe(502)
    expect(store.getTank('demo-dapp')!.balanceUqor).toBe(10_000_000n - svc.estimateFeeUqor(200_000))
  })
})

describe('relayer app routes', () => {
  it('tanks: admin create (401 without token), GET shows balance', async () => {
    const { store, svc } = setup()
    const app = createRelayerApp({ net: DIANA, store, relay: svc, sponsor: new SponsorService(DIANA, store, { send: async () => 'X' }), adminToken: 'secret-token' })
    const body = JSON.stringify({ id: 'tip-jar', name: 'Tip jar', owner: ACCOUNT, balanceUqor: '1000000' })
    expect((await app.request('/v1/tanks', { method: 'POST', body })).status).toBe(401)
    expect((await app.request('/v1/tanks', { method: 'POST', body, headers: { authorization: 'Bearer wrong-token!' } })).status).toBe(401)
    expect((await app.request('/v1/tanks', { method: 'POST', body, headers: { authorization: 'Bearer secret-token' } })).status).toBe(201)
    const t = await (await app.request('/v1/tanks/tip-jar')).json()
    expect(t).toMatchObject({ id: 'tip-jar', balance: '1000000', dailySpent: '0' })
  })
})
