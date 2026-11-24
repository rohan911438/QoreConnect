/**
 * P15 (renew): can the SAME MetaMask key be linked again after it expired, and after it was revoked? The SDK has no
 * "update authenticator" message, so renewing means a new MsgRegisterAuthenticator for the same public key.
 */
import { describe, expect, it } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import {
  DIANA,
  MemoryVaultStorage,
  RootVault,
  getSessionState,
  linkSessionKey,
  onboardRoot,
  revokeKeys,
  signLinkProof,
} from '@rohankumar4179/core'
import { MNEMONIC, RELAYER_URL, inProcessRelayer, standInMetaMask } from './helpers'

const COUNTER = '0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74'
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe.skipIf(!MNEMONIC)('renewing a MetaMask key on Diana (integration)', () => {
  it('re-links the same key after expiry and after revocation', async () => {
    const r = await inProcessRelayer()
    const vault = new RootVault(new MemoryVaultStorage())
    const root = await vault.create({
      kind: 'password',
      password: 'integration renew only',
      scrypt: { N: 2 ** 10, r: 8, p: 1 },
    })
    const mm = standInMetaMask(generatePrivateKey())
    await onboardRoot({ net: DIANA, root, ethereum: mm, relayerUrl: RELAYER_URL, fetch: r.fetchImpl })
    await r.sender.send(root.qorAddress, 1_500_000n) // test-only top-up for the writes below

    const proof = await signLinkProof(DIANA, root.qorAddress, mm)
    const keyOf = async () => (await getSessionState({ net: DIANA }, root.qorAddress)).keys.filter((k) => k.isMetaMask)

    // 1. Link with a 45-second lifetime and wait for it to expire.
    await linkSessionKey({
      net: DIANA,
      root,
      contracts: [COUNTER],
      proof,
      expiryUnix: Math.floor(Date.now() / 1000) + 45,
    })
    expect((await keyOf()).some((k) => k.active)).toBe(true)
    await sleep(60_000)
    expect((await keyOf()).some((k) => k.active)).toBe(false)

    // 2. Renew: register the same key again with a new expiry (the same possession proof is reused).
    const week = Math.floor(Date.now() / 1000) + 7 * 86_400
    const renewed = await linkSessionKey({ net: DIANA, root, contracts: [COUNTER], proof, expiryUnix: week })
    console.log('renew after expiry tx', renewed.tx?.transactionHash)
    let keys = await keyOf()
    console.log(
      'after renew',
      JSON.stringify(keys.map((k) => ({ active: k.active, expiry: k.expiryUnix, revoked: k.revoked }))),
    )
    expect(keys.some((k) => k.active && k.expiryUnix === week)).toBe(true)

    // 3. Revoke, then link the same key again.
    await revokeKeys({ net: DIANA, root, keys: 'all-classical' })
    expect((await keyOf()).some((k) => k.active)).toBe(false)
    const again = await linkSessionKey({ net: DIANA, root, contracts: [COUNTER], proof, expiryUnix: week + 60 })
    console.log('relink after revoke tx', again.tx?.transactionHash)
    keys = await keyOf()
    console.log(
      'after relink',
      JSON.stringify(keys.map((k) => ({ active: k.active, expiry: k.expiryUnix, revoked: k.revoked }))),
    )
    expect(keys.some((k) => k.active && k.expiryUnix === week + 60)).toBe(true)

    // 4. Renew early, while the key is still active: the expiry moves and there is still exactly one entry.
    const early = await linkSessionKey({ net: DIANA, root, contracts: [COUNTER], proof, expiryUnix: week + 120 })
    console.log('renew while active tx', early.tx?.transactionHash)
    keys = await keyOf()
    console.log(
      'after early renew',
      JSON.stringify(keys.map((k) => ({ active: k.active, expiry: k.expiryUnix, revoked: k.revoked }))),
    )
    expect(keys.filter((k) => !k.revoked)).toHaveLength(1)
    expect(keys[0]).toMatchObject({ active: true, expiryUnix: week + 120 })
  }, 480_000)
})
