import { config } from 'dotenv'
import { resolve } from 'node:path'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { DIANA, MemoryVaultStorage, QoreClient, RootVault, onboardRoot, type Eip1193Provider, type RootSigner } from '@qoreconnect/core'
import { ChainFundsSender, DEFAULT_SPONSOR, RelayerStore, SponsorService, createRelayerApp, operatorAccount } from '../../src/index'

config({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true } as any)
export const MNEMONIC = process.env.SPONSOR_MNEMONIC
export const RELAYER_URL = 'http://relayer.test'

/** A stand-in for MetaMask: an EIP-1193 provider backed by a throwaway local key (personal_sign like MetaMask). */
export function standInMetaMask(pk = generatePrivateKey()): Eip1193Provider & { address: `0x${string}` } {
  const acct = privateKeyToAccount(pk)
  return {
    address: acct.address,
    async request({ method, params }) {
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [acct.address]
      if (method === 'personal_sign') return acct.signMessage({ message: { raw: (params as string[])[0] as `0x${string}` } })
      throw new Error(`unsupported ${method}`)
    },
  }
}

/** In-process relayer (sponsor only) wired to Diana, plus a fetch that routes RELAYER_URL to it. */
export async function inProcessRelayer() {
  const sponsorAcct = await operatorAccount(MNEMONIC!, Number(process.env.SPONSOR_INDEX ?? 0))
  const store = new RelayerStore(':memory:')
  const client = new QoreClient(DIANA)
  const sender = new ChainFundsSender(DIANA, sponsorAcct)
  const svc = new SponsorService(DIANA, store, sender, DEFAULT_SPONSOR, async (r) => (await client.getPqcKey(r)).registered)
  const app = createRelayerApp({ net: DIANA, store, sponsor: svc })
  const fetchImpl = (async (input: string, init?: RequestInit) =>
    input.startsWith(RELAYER_URL) ? app.request(input.slice(RELAYER_URL.length), init as any) : fetch(input, init)) as any
  return { app, store, client, sender, sponsorAcct, fetchImpl }
}

/** A brand-new root: vault → sponsored → ML-DSA registered; optional test-only top-up for multi-step tests. */
export async function freshRoot(topUpUqor = 0n): Promise<{ root: RootSigner; mm: ReturnType<typeof standInMetaMask>; fetchImpl: any; client: QoreClient }> {
  const r = await inProcessRelayer()
  const vault = new RootVault(new MemoryVaultStorage())
  const root = await vault.create({ kind: 'password', password: 'integration test only', scrypt: { N: 2 ** 10, r: 8, p: 1 } })
  const mm = standInMetaMask()
  await onboardRoot({ net: DIANA, root, ethereum: mm, relayerUrl: RELAYER_URL, fetch: r.fetchImpl })
  if (topUpUqor > 0n) await r.sender.send(root.qorAddress, topUpUqor)
  return { root, mm, fetchImpl: r.fetchImpl, client: r.client }
}
