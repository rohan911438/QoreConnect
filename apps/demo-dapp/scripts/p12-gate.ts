/**
 * P12 gate on Diana: the Doctor's first failure for a fresh address, a linked-but-expired key, a contract that is not
 * approved, and a healthy account (G3); and one Migration Meter snapshot with a timed EVM sender sample (failure
 * branch check). Needs SPONSOR_MNEMONIC in the repo-root .env. Testnet only.
 */
import { config as dotenv } from 'dotenv'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { DIANA, MemoryVaultStorage, QoreClient, RootVault, linkSessionKey, onboardRoot, type Eip1193Provider } from '@qoreconnect/core'
import { ChainFundsSender, DEFAULT_SPONSOR, RelayerStore, RpcEvmSampler, SponsorService, computeMeter, createRelayerApp, operatorAccount, runDoctor } from '@qoreconnect/relayer'

const here = import.meta.dirname
dotenv({ path: resolve(here, '../../../.env'), quiet: true } as any)
const MNEMONIC = process.env.SPONSOR_MNEMONIC
if (!MNEMONIC) throw new Error('SPONSOR_MNEMONIC missing')
const dep = JSON.parse(readFileSync(resolve(here, '../src/deployments.json'), 'utf8'))
const TIPJAR = dep.contracts.QoreTipJar.address as string
const DRAINER = dep.contracts.Drainer.address as string
const RELAYER_URL = 'http://relayer.p12'

const store = new RelayerStore(':memory:')
store.createTank({ id: 'demo-dapp', name: 'Quantum Tip Jar', owner: 'p12', balanceUqor: 20_000_000n, perUserDailyCapUqor: 5_000_000n })
const client = new QoreClient(DIANA)
const funds = new ChainFundsSender(DIANA, await operatorAccount(MNEMONIC, 0))
const sponsor = new SponsorService(DIANA, store, funds, DEFAULT_SPONSOR, async (r) => (await client.getPqcKey(r)).registered)
const app = createRelayerApp({ net: DIANA, store, sponsor })
const fetchImpl = (async (input: string, init?: RequestInit) => (String(input).startsWith(RELAYER_URL) ? app.request(String(input).slice(RELAYER_URL.length), init as any) : fetch(input, init))) as any
const doctor = (address: string, target?: string) => runDoctor(client, { address, target, tankId: 'demo-dapp' }, { getTank: (id) => store.getTank(id) })
const brief = (r: Awaited<ReturnType<typeof doctor>>) => ({ account: r.account, healthy: r.healthy, first: r.firstFailure ? `${r.firstFailure.id} → fix: ${r.firstFailure.fix?.kind}` : null, detail: r.firstFailure?.detail, statuses: r.checks.map((c) => `${c.id}:${c.status}`).join(' ') })

// One onboarded root with MetaMask linked for the Tip Jar, expiring in 75 s.
const mm = privateKeyToAccount(generatePrivateKey())
const metamask: Eip1193Provider = {
  request: async ({ method, params }) => (method === 'personal_sign' ? mm.signMessage({ message: { raw: (params as string[])[0] as `0x${string}` } }) : [mm.address]),
}
const root = await new RootVault(new MemoryVaultStorage()).create({ kind: 'password', password: 'p12 gate', scrypt: { N: 2 ** 10, r: 8, p: 1 } })
await onboardRoot({ net: DIANA, root, ethereum: metamask, relayerUrl: RELAYER_URL, fetch: fetchImpl })
const expiry = Math.floor(Date.now() / 1000) + 75
const link = await linkSessionKey({ net: DIANA, root, fetch: fetchImpl, metamask, contracts: [TIPJAR], expiryUnix: expiry })
console.log('linked', root.qorAddress, 'tx', link.tx.transactionHash, 'expires', new Date(expiry * 1000).toISOString())

const results: Record<string, unknown> = {}
results.fresh = brief(await doctor(privateKeyToAccount(generatePrivateKey()).address))
results.healthy = brief(await doctor(root.qorAddress, TIPJAR))
results.notApproved = brief(await doctor(root.evmAddress, DRAINER))
const wait = expiry * 1000 - Date.now() + 8000
console.log(`waiting ${Math.round(wait / 1000)} s for the key to expire…`)
await new Promise((r) => setTimeout(r, wait))
results.expired = brief(await doctor(root.qorAddress, TIPJAR))

// Migration Meter: one snapshot against Diana, sampler timed.
const t0 = Date.now()
const sample = await new RpcEvmSampler(DIANA.evmRpc).sample(200, 50)
const sampleMs = Date.now() - t0
const snap = await computeMeter({ net: DIANA, store, chain: client, sampler: { sample: async () => sample } }, { publicUrl: 'http://localhost:8787' })
results.meter = { sampleMs, sampleSize: sample.senders.length, blocks: `${sample.fromBlock}-${sample.toBlock}`, withKey: snap.metrics.pqcSenders?.withKey, metrics: Object.fromEntries(Object.entries(snap.metrics).map(([k, v]) => [k, v?.value])), errors: snap.errors }
console.log(JSON.stringify(results, null, 2))

const ok =
  (results.fresh as any).first?.startsWith('pqc-key') &&
  (results.healthy as any).healthy &&
  (results.notApproved as any).first?.startsWith('target') &&
  (results.expired as any).first?.startsWith('linked-key → fix: renew')
console.log(ok ? 'P12 G3: PASS' : 'P12 G3: FAIL')
root.lock()
process.exit(ok ? 0 : 1)
