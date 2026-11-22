/**
 * P13: the five invariants of architecture/06, once against Diana (the same invariants run against mocked chain state
 * in packages/core/test/invariants.test.ts, in CI).
 *
 *  I1 every linked value-moving key is bounded by an enabled rule (checked after every write and at the end)
 *  I2 rule updates never drop other rules (a foreign rule survives link → approve → limits)
 *  I3 the relayer never broadcasts a stale nonce (replay is refused before broadcast; the tank is not debited)
 *  I4 success is reported only when the chain's execution result says success=true for this call
 *  I5 no private key or seed leaves the process: every URL, body and broadcast tx is scanned
 */
import { describe, expect, it } from 'vitest'
import { decodeAuthenticatorExecutions } from '@qorechain/sdk'
import { encodeFunctionData, parseAbi } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import {
  DIANA,
  LeakDetector,
  MemoryVaultStorage,
  RootVault,
  assertRuleInvariants,
  fetchTxResult,
  fromRelayRequest,
  getSessionState,
  isSameCall,
  linkSessionKey,
  onboardRoot,
  setLimits,
  signRelayRequest,
} from '@qoreconnect/core'
import { ChainRelay, RelayService, RelayerStore, operatorAccount } from '../../src/index'
import { MNEMONIC, RELAYER_URL, inProcessRelayer, standInMetaMask } from './helpers'

const COUNTER = '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74'
const abi = parseAbi(['function increment()', 'function tip() payable'])
const QOR = 10n ** 18n

describe.skipIf(!MNEMONIC)('invariants on Diana (integration)', () => {
  it('I1–I5 hold through onboarding, linking, limits, relays, a replay and a chain refusal', async () => {
    const r = await inProcessRelayer()
    const vault = new RootVault(new MemoryVaultStorage())
    const password = 'integration invariants only'
    const root = await vault.create({ kind: 'password', password, scrypt: { N: 2 ** 10, r: 8, p: 1 } })
    const mnemonic = await vault.exportRecoveryCode({ kind: 'password', password })
    const mmKey = generatePrivateKey()
    const mm = standInMetaMask(mmKey)
    const acct = root.unsafeAccount()

    // I5: scan everything this client sends, including the decoded bytes of every broadcast transaction.
    const d = new LeakDetector({ mnemonic, keys: [acct.privateKey, mmKey], mldsaSecretKeys: [acct.pqc.secretKey] })
    const scanned = d.wrapFetch(r.fetchImpl)
    const fetchImpl = (async (input: any, init?: any) => {
      if (typeof init?.body === 'string' && init.body.includes('tx_bytes')) {
        const b64 = JSON.parse(init.body).tx_bytes as string
        d.bytes('broadcast tx', Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)))
      }
      return scanned(input, init)
    }) as any

    await onboardRoot({ net: DIANA, root, ethereum: mm, relayerUrl: RELAYER_URL, fetch: fetchImpl })
    await r.sender.send(root.qorAddress, 1_500_000n) // test-only top-up for the writes below
    const ctx = { net: DIANA, root, fetch: fetchImpl }

    // I1 + I2: every write below runs the invariant checker (checkInvariants defaults to true).
    await linkSessionKey({ ...ctx, metamask: mm, contracts: [COUNTER] })
    const rulesAfterLink = (await getSessionState(ctx, root.qorAddress)).rules.map((x) => x.id)
    await setLimits({ ...ctx, limits: { perTxUqor: 500_000n, dailyUqor: 600_000n } })
    const state = await getSessionState(ctx, root.qorAddress)
    expect(() => assertRuleInvariants(state)).not.toThrow()
    for (const id of rulesAfterLink) expect(state.rules.map((x) => x.id)).toContain(id)

    const relayerAcct = await operatorAccount(MNEMONIC!, Number(process.env.RELAYER_INDEX ?? 1))
    const store = new RelayerStore(':memory:')
    store.createTank({ id: 'inv', name: 'Invariants', owner: 'test', balanceUqor: 20_000_000n, perUserDailyCapUqor: 5_000_000n })
    const chain = new ChainRelay(DIANA, relayerAcct)
    const svc = new RelayService(DIANA, store, chain, { perAccountPerMinute: 30, perIpPerMinute: 60, maxGasLimit: 3_000_000 })
    const sign = (data: string, valueWei = 0n) =>
      signRelayRequest({ net: DIANA, ethereum: mm, metamaskAddress: mm.address, account: root.qorAddress, to: COUNTER, data, valueWei, tankId: 'inv', gasLimit: 200_000, fetch: fetchImpl })
    const chainSuccess = async (hash: string, call: { to: string; data: string; valueWei: bigint }) => {
      const tx = await fetchTxResult(DIANA, hash)
      const msgs: any[] = ((tx as any)?.tx?.body?.messages ?? []).filter((m: any) => m['@type'] === '/qorechain.abstractaccount.v1.MsgExecuteEVM')
      const idx = msgs.findIndex((m) => isSameCall(m, { account: root.qorAddress, ...call }))
      expect(idx).toBeGreaterThanOrEqual(0)
      return !!decodeAuthenticatorExecutions(tx as any)[idx]?.success
    }

    // I4 (success branch): the relayer's success matches the chain's execution result for this call.
    const inc = encodeFunctionData({ abi, functionName: 'increment' })
    const okReq = await sign(inc)
    d.text('relay request', JSON.stringify(okReq))
    const ok = await svc.relay(okReq, 'test')
    expect(ok.body).toMatchObject({ ok: true, success: true })
    expect(await chainSuccess(ok.body.txHash!, { to: COUNTER, data: inc, valueWei: 0n })).toBe(true)

    // I3: replaying the same signed request is refused before broadcast; the tank is not debited.
    const tank = store.getTank('inv')!.balanceUqor
    const replay = await svc.relay(okReq, 'test')
    expect(replay.body).toMatchObject({ code: 'NONCE', preRejected: true })
    expect(store.getTank('inv')!.balanceUqor).toBe(tank)

    // I4 (failure branch): 0.4 + 0.4 QOR against a 0.6 QOR daily limit. The relayer refuses the second before broadcast
    // (it counts today's spend), without debiting the tank; sent straight to the chain, as an attacker's own relayer would,
    // the same signed call is refused by the chain too, so the relayer's answer matches the chain's.
    const tip = encodeFunctionData({ abi, functionName: 'tip' })
    const t1 = await svc.relay(await sign(tip, (4n * QOR) / 10n), 'test')
    expect(t1.body).toMatchObject({ ok: true, success: true })
    const over = await sign(tip, (4n * QOR) / 10n)
    const tankBefore = store.getTank('inv')!.balanceUqor
    const t2 = await svc.relay(over, 'test')
    expect(t2.body).toMatchObject({ ok: false, code: 'LIMIT_EXCEEDED', preRejected: true })
    expect(store.getTank('inv')!.balanceUqor).toBe(tankBefore)
    const direct = await chain.submit(fromRelayRequest(over, chain.relayerAddress), Number(over.gasLimit))
    expect(await chainSuccess(direct.transactionHash, { to: COUNTER, data: tip, valueWei: (4n * QOR) / 10n })).toBe(false)

    // I1 still holds at the end; I5: nothing secret was sent.
    const end = await getSessionState(ctx, root.qorAddress)
    expect(() => assertRuleInvariants(end)).not.toThrow()
    expect(d.scanned).toBeGreaterThan(10)
    expect(d.leaks).toEqual([])
    console.log(JSON.stringify({ root: root.qorAddress, scanned: d.scanned, success: ok.body.txHash, refused: direct.transactionHash }, null, 2))
    root.lock()
  })
})
