/** P05 G2–G6: session-key lifecycle on Diana, invariant checker after every step. */
import { describe, expect, it } from 'vitest'
import { DIANA, approveDapp, getSessionState, linkSessionKey, revokeKeys, setLimits, assertRuleInvariants, type SessionState } from '@rohankumar4179/core'
import { MNEMONIC, freshRoot, standInMetaMask } from './helpers'

const A = '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74' // SpikeCounter (allowed), deployed in P01
const B = '0x5017fbbc1de44e698d1778630bce63741c1d0005' // SpikeCounter (other)

describe.skipIf(!MNEMONIC)('session keys on Diana (integration)', () => {
  it('link → approve → set limits → revoke one → link two → revoke all', async () => {
    const { root, mm, fetchImpl } = await freshRoot(600_000n)
    const ctx = { net: DIANA, root, fetch: fetchImpl }
    const hashes: Record<string, string> = {}
    const check = (s: SessionState) => assertRuleInvariants({ rules: s.rules, keys: s.keys })

    // G2 link
    const l1 = await linkSessionKey({ ...ctx, metamask: mm, contracts: [A] })
    hashes.link = l1.tx.transactionHash
    const k1 = l1.state.keys.find((k) => k.pubkeyHex === l1.pubkeyHex)!
    expect(k1.permissions).toEqual(['evm'])
    expect(k1.expiryUnix).toBeGreaterThan(Date.now() / 1000)
    expect(l1.state.managed).toMatchObject({ enabled: true, allowedEvmCalls: [A] })
    check(l1.state)

    // G3 approve a second contract; first still present
    const ap = await approveDapp({ ...ctx, contracts: [B] })
    hashes.approve = ap.tx.transactionHash
    expect(ap.state.approved).toEqual([A, B])
    check(ap.state)

    // limits
    const lim = await setLimits({ ...ctx, limits: { perTxUqor: 500_000n, dailyUqor: 2_000_000n } })
    hashes.limits = lim.tx.transactionHash
    expect(lim.state.managed).toMatchObject({ perTxLimit: 500_000n, dailyLimit: 2_000_000n, allowedEvmCalls: [A, B] })
    check(lim.state)

    // revoke one
    const r1 = await revokeKeys({ ...ctx, keys: [l1.pubkeyHex] })
    hashes.revokeOne = r1.tx!.transactionHash
    expect(r1.state.keys.find((k) => k.pubkeyHex === l1.pubkeyHex)?.revoked).toBe(true)
    check(r1.state)

    // link two more MetaMask keys (rules preserved across links)
    const l2 = await linkSessionKey({ ...ctx, metamask: standInMetaMask(), contracts: [] })
    const l3 = await linkSessionKey({ ...ctx, metamask: standInMetaMask(), contracts: [] })
    hashes.link2 = l2.tx.transactionHash
    hashes.link3 = l3.tx.transactionHash
    expect(l3.state.approved).toEqual([A, B])
    expect(l3.state.keys.filter((k) => k.active)).toHaveLength(2)
    check(l3.state)

    // G4 revoke all classical keys in one tx
    const all = await revokeKeys({ ...ctx, keys: 'all-classical' })
    hashes.revokeAll = all.tx!.transactionHash
    expect(all.revoked).toBe(2)
    const final = await getSessionState(ctx, root.qorAddress)
    expect(final.keys.filter((k) => k.active && k.isMetaMask)).toHaveLength(0)
    check(final)

    console.log(JSON.stringify({ root: root.qorAddress, hashes }, null, 2))
    root.lock()
  })
})
