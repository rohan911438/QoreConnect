/** P06 G2–G5 on Diana: relay success, over-limit (pre-rejected and on-chain), replay, 5 parallel relays. */
import { describe, expect, it } from 'vitest'
import { createPublicClient, encodeFunctionData, http, parseAbi } from 'viem'
import { DIANA, approveDapp, linkSessionKey, setLimits, signRelayRequest, type RelayRequest } from '@rohankumar4179/core'
import { ChainRelay, RelayService, RelayerStore, operatorAccount } from '../../src/index'
import { MNEMONIC, freshRoot, standInMetaMask } from './helpers'

const COUNTER = '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74' // SpikeCounter (P01)
const abi = parseAbi(['function increment()', 'function tip() payable', 'function count() view returns (uint256)'])
const QOR = 10n ** 18n
const inc = encodeFunctionData({ abi, functionName: 'increment' })
const tip = encodeFunctionData({ abi, functionName: 'tip' })

describe.skipIf(!MNEMONIC)('relayer on Diana (integration)', () => {
  it('success, limits, replay and concurrency', async () => {
    const relayerAcct = await operatorAccount(MNEMONIC!, Number(process.env.RELAYER_INDEX ?? 1))
    const store = new RelayerStore(':memory:')
    store.createTank({ id: 'demo-dapp', name: 'Demo', owner: 'test', balanceUqor: 50_000_000n, perUserDailyCapUqor: 5_000_000n })
    const svc = new RelayService(DIANA, store, new ChainRelay(DIANA, relayerAcct), { perAccountPerMinute: 30, perIpPerMinute: 60, maxGasLimit: 3_000_000 })
    const evm = createPublicClient({ transport: http(DIANA.evmRpc) })
    const count = () => evm.readContract({ address: COUNTER, abi, functionName: 'count' })

    const { root, mm, fetchImpl } = await freshRoot(1_500_000n)
    const ctx = { net: DIANA, root, fetch: fetchImpl }
    await linkSessionKey({ ...ctx, metamask: mm, contracts: [COUNTER] })
    await setLimits({ ...ctx, limits: { perTxUqor: 500_000n, dailyUqor: 600_000n } })
    const sign = (o: { data: string; valueWei?: bigint; who?: typeof mm }) =>
      signRelayRequest({ net: DIANA, ethereum: o.who ?? mm, metamaskAddress: (o.who ?? mm).address, account: root.qorAddress, to: COUNTER, data: o.data, valueWei: o.valueWei, tankId: 'demo-dapp', gasLimit: 200_000 })
    const hashes: Record<string, string | undefined> = {}

    // G2 success
    const before = await count()
    const okReq = await sign({ data: inc })
    const ok = await svc.relay(okReq, 'test')
    hashes.success = ok.body.txHash
    if (!ok.body.success) console.log('first relay', JSON.stringify(ok.body))
    expect(ok.body).toMatchObject({ ok: true, success: true })
    expect(await count()).toBe(before + 1n)

    // G4 replay of the same signed message: NONCE, no broadcast
    const tankBeforeReplay = store.getTank('demo-dapp')!.balanceUqor
    const replay = await svc.relay(okReq, 'test')
    expect(replay.body).toMatchObject({ code: 'NONCE', chainCode: 11, preRejected: true })
    expect(store.getTank('demo-dapp')!.balanceUqor).toBe(tankBeforeReplay)

    // G3a over per-tx limit: pre-rejected, tank not debited
    const big = await svc.relay(await sign({ data: tip, valueWei: (7n * QOR) / 10n }), 'test')
    expect(big.body).toMatchObject({ code: 'LIMIT_EXCEEDED', chainCode: 5, preRejected: true })
    expect(store.getTank('demo-dapp')!.balanceUqor).toBe(tankBeforeReplay)

    // G3b within per-tx, then over the daily limit on chain: refused by the chain, tank debited
    const t1 = await svc.relay(await sign({ data: tip, valueWei: (4n * QOR) / 10n }), 'test')
    hashes.tipOk = t1.body.txHash
    expect(t1.body).toMatchObject({ ok: true, success: true })
    const tankBeforeDaily = store.getTank('demo-dapp')!.balanceUqor
    const t2 = await svc.relay(await sign({ data: tip, valueWei: (4n * QOR) / 10n }), 'test')
    hashes.dailyRefused = t2.body.txHash
    console.log('daily-limit relay', JSON.stringify(t2.body))
    expect(t2.body).toMatchObject({ ok: true, success: false, code: 'LIMIT_EXCEEDED', chainCode: 5 })
    expect(store.getTank('demo-dapp')!.balanceUqor).toBe(tankBeforeDaily - BigInt(t2.body.feeUqor!))

    // G5 five parallel relays (five linked keys, one relayer account, one queue)
    const keys = [standInMetaMask(), standInMetaMask(), standInMetaMask(), standInMetaMask(), standInMetaMask()]
    for (const k of keys) await linkSessionKey({ ...ctx, metamask: k, contracts: [] })
    await approveDapp({ ...ctx, contracts: [COUNTER] }) // idempotent; keeps the allow-list
    const reqs: RelayRequest[] = await Promise.all(keys.map((k) => sign({ data: inc, who: k })))
    const c0 = await count()
    const t0 = Date.now()
    const results = await Promise.all(reqs.map((r) => svc.relay(r, 'test')))
    const ms = Date.now() - t0
    hashes.parallel = results.map((r) => r.body.txHash).join(',')
    expect(results.every((r) => r.body.ok && r.body.success)).toBe(true)
    expect(await count()).toBe(c0 + 5n)

    console.log(JSON.stringify({ root: root.qorAddress, relayer: relayerAcct.cosmos, hashes, parallelMs: ms, tankLeftUqor: String(store.getTank('demo-dapp')!.balanceUqor) }, null, 2))
    root.lock()
  })
})
