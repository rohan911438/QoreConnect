/**
 * P04 G2/G5: a brand-new root is sponsored by the relayer and registers its ML-DSA-87 key on Diana.
 * Needs SPONSOR_MNEMONIC in the repo-root .env (testnet operator). Skipped when absent (CI without secrets).
 * Lives in packages/relayer (not core) because it exercises both packages end to end without a dependency cycle.
 */
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { DIANA, MemoryVaultStorage, QoreClient, RootVault, explorerTx, formatQor, onboardRoot, type Eip1193Provider, type OnboardEvent } from '@qoreconnect/core'
import { ChainFundsSender, RelayerStore, SponsorService, createRelayerApp, operatorAccount, DEFAULT_SPONSOR } from '../../src/index'

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true } as any)
const MNEMONIC = process.env.SPONSOR_MNEMONIC

/** A stand-in for MetaMask: an EIP-1193 provider backed by a throwaway local key. */
function standInMetaMask(): Eip1193Provider & { address: string } {
  const acct = privateKeyToAccount(generatePrivateKey())
  return {
    address: acct.address,
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [acct.address]
      if (method === 'personal_sign') return acct.signMessage({ message: { raw: (params as string[])[0] as `0x${string}` } })
      throw new Error(`unsupported ${method}`)
    },
  }
}

describe.skipIf(!MNEMONIC)('onboarding on Diana (integration)', () => {
  it('fresh root → sponsored → ML-DSA-87 registered with possessionProven', async () => {
    const sponsorAcct = await operatorAccount(MNEMONIC!, Number(process.env.SPONSOR_INDEX ?? 0))
    const store = new RelayerStore(':memory:')
    const client = new QoreClient(DIANA)
    const svc = new SponsorService(DIANA, store, new ChainFundsSender(DIANA, sponsorAcct), DEFAULT_SPONSOR, async (r) => (await client.getPqcKey(r)).registered)
    const app = createRelayerApp({ net: DIANA, store, sponsor: svc })
    const RELAYER = 'http://relayer.test'
    // Route relayer calls in-process; everything else goes to the real network.
    const fetchImpl = (async (input: string, init?: RequestInit) =>
      input.startsWith(RELAYER) ? app.request(input.slice(RELAYER.length), init as any) : fetch(input, init)) as any

    const vault = new RootVault(new MemoryVaultStorage())
    const root = await vault.create({ kind: 'password', password: 'integration test only', scrypt: { N: 2 ** 10, r: 8, p: 1 } })
    const events: OnboardEvent[] = []
    const mm = standInMetaMask()
    const res = await onboardRoot({ net: DIANA, root, ethereum: mm, relayerUrl: RELAYER, fetch: fetchImpl, onEvent: (e) => events.push(e) })

    const st = await client.getPqcKey(root.qorAddress, { fresh: true })
    console.log(JSON.stringify({ root: root.qorAddress, evm: root.evmAddress, metamask: mm.address, sponsorTx: res.sponsorTx, registerTx: res.registerTx, ms: res.ms, balanceAfter: formatQor(await client.getBalance(root.qorAddress)), explorer: res.registerTx && explorerTx(DIANA, res.registerTx) }, null, 2))
    expect(st.registered).toBe(true)
    expect(st.possessionProven).toBe(true)
    expect(events.map((e) => e.step)).toEqual(['checking', 'sponsoring', 'sponsored', 'waiting-funds', 'registering', 'registered'])

    // Idempotent second run: skips straight to registered.
    const again = await onboardRoot({ net: DIANA, root, ethereum: mm, relayerUrl: RELAYER, fetch: fetchImpl })
    expect(again.alreadyRegistered).toBe(true)

    // G3 against the live service: a second sponsorship for the same MetaMask is refused.
    const second = await (await import('@qoreconnect/core')).requestSponsorship({ net: DIANA, relayerUrl: RELAYER, rootAddress: 'qor17fuv7k0c9mw0suwkxreganyq2me9c8xmdl9s7p', ethereum: mm, fetch: fetchImpl }).catch((e) => e)
    expect(second).toMatchObject({ code: 'SPONSOR_REFUSED' })
    root.lock()
  })
})
