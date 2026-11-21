/**
 * P10 G4 — `pnpm demo:attack`: reproduce the phishing attack on Diana testnet and print the chain's refusal.
 *
 * Scenario: a user has a QoreConnect account. Their MetaMask key is linked as a capped session key that may only call
 * the Quantum Tip Jar. An attacker steals the MetaMask key (or tricks the user into signing) and tries to send value to
 * a Drainer contract ("claim airdrop").
 *
 *   1. Control: a tip within limits through the relayer succeeds.
 *   2. Through the QoreConnect relayer: refused locally by the mandatory pre-check (no broadcast, no fee).
 *   3. The attacker runs their OWN relayer (our pre-check skipped) and broadcasts the signed call: the chain refuses it.
 *
 * Needs SPONSOR_MNEMONIC (and optionally RELAYER_MNEMONIC/RELAYER_INDEX) in the repo-root .env. Testnet only.
 */
import { config as dotenv } from 'dotenv'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { encodeFunctionData, parseAbi, parseEther } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { decodeAuthenticatorExecutions } from '@qorechain/sdk'
import {
  DIANA,
  MemoryVaultStorage,
  QoreClient,
  RootVault,
  classifyChainRefusal,
  explorerTx,
  fromRelayRequest,
  linkSessionKey,
  onboardRoot,
  signRelayRequest,
  type Eip1193Provider,
} from '@qoreconnect/core'
import {
  CHAIN_CODES,
  ChainFundsSender,
  ChainRelay,
  DEFAULT_SPONSOR,
  RelayService,
  RelayerStore,
  SponsorService,
  createRelayerApp,
  operatorAccount,
} from '@qoreconnect/relayer'

const here = import.meta.dirname
dotenv({ path: resolve(here, '../../../.env'), quiet: true } as any)
const MNEMONIC = process.env.SPONSOR_MNEMONIC
if (!MNEMONIC) {
  console.error('SPONSOR_MNEMONIC is missing in the repo-root .env (testnet operator phrase).')
  process.exit(2)
}

const dep = JSON.parse(readFileSync(resolve(here, '../src/deployments.json'), 'utf8'))
const TIPJAR = dep.contracts.QoreTipJar.address as `0x${string}`
const DRAINER = dep.contracts.Drainer.address as `0x${string}`
const abi = parseAbi(['function tip(address creator, string note) payable', 'function claimAirdrop() payable'])
const RELAYER_URL = 'http://relayer.attack-demo'
const TANK = 'demo-dapp'

const step = (n: string, s: string) => console.log(`\n\x1b[1m${n}\x1b[0m ${s}`)
const kv = (o: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(o)) console.log(`   ${k.padEnd(14)} ${v}`)
}

// --- Infrastructure: in-process sponsor + relayer, wired to Diana ---------------------------------------------------
const store = new RelayerStore(':memory:')
store.createTank({ id: TANK, name: 'Quantum Tip Jar', owner: 'attack-demo', balanceUqor: 20_000_000n, perUserDailyCapUqor: 5_000_000n })
const client = new QoreClient(DIANA)
const funds = new ChainFundsSender(DIANA, await operatorAccount(MNEMONIC, Number(process.env.SPONSOR_INDEX ?? 0)))
const sponsor = new SponsorService(DIANA, store, funds, DEFAULT_SPONSOR, async (r) => (await client.getPqcKey(r)).registered)
const chain = new ChainRelay(DIANA, await operatorAccount(process.env.RELAYER_MNEMONIC ?? MNEMONIC, Number(process.env.RELAYER_INDEX ?? 1)))
const relay = new RelayService(DIANA, store, chain)
const app = createRelayerApp({ net: DIANA, store, sponsor, relay })
const fetchImpl = (async (input: string, init?: RequestInit) =>
  String(input).startsWith(RELAYER_URL) ? app.request(String(input).slice(RELAYER_URL.length), init as any) : fetch(input, init)) as any

// --- The victim: quantum-safe root + MetaMask linked for the Tip Jar only -----------------------------------------
const mmKey = generatePrivateKey()
const mmAcct = privateKeyToAccount(mmKey)
const metamask: Eip1193Provider & { address: `0x${string}` } = {
  address: mmAcct.address,
  async request({ method, params }) {
    if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [mmAcct.address]
    if (method === 'personal_sign') return mmAcct.signMessage({ message: { raw: (params as string[])[0] as `0x${string}` } })
    throw new Error(`unsupported ${method}`)
  },
}
const t0 = Date.now()
step('[0/3]', 'Victim onboards: quantum-safe root, MetaMask linked as a capped key for the Tip Jar only')
const root = await new RootVault(new MemoryVaultStorage()).create({ kind: 'password', password: 'attack demo only', scrypt: { N: 2 ** 10, r: 8, p: 1 } })
await onboardRoot({ net: DIANA, root, ethereum: metamask, relayerUrl: RELAYER_URL, fetch: fetchImpl })
await funds.send(root.qorAddress, 1_500_000n) // test-only top-up so value can move
const ctx = { net: DIANA, root, fetch: fetchImpl }
await linkSessionKey({ ...ctx, metamask, contracts: [TIPJAR] })
kv({ account: root.qorAddress, 'account 0x': root.evmAddress, 'MetaMask key': mmAcct.address, 'allow-list': `QoreTipJar ${TIPJAR}`, limits: '1 QOR per tx, 5 QOR per day (defaults)' })

const sign = (to: string, data: string, valueWei: bigint) =>
  signRelayRequest({ net: DIANA, ethereum: metamask, metamaskAddress: mmAcct.address, account: root.qorAddress, to, data, valueWei, tankId: TANK, gasLimit: 200_000 })

// --- 1. Control ----------------------------------------------------------------------------------------------------
step('[1/3]', 'Control: tip 0.1 QOR to a creator through the relayer (within limits)')
const tip = await relay.relay(await sign(TIPJAR, encodeFunctionData({ abi, functionName: 'tip', args: [dep.deployer, 'from the attack demo control'] }), parseEther('0.1')), 'demo')
kv({ result: tip.body.success ? 'SUCCESS' : `FAILED ${tip.body.code} ${tip.body.error}`, tx: tip.body.txHash, explorer: tip.body.explorer })
if (!tip.body.success) throw new Error('control tip failed; the demo cannot continue')

// --- 2. Attack through the QoreConnect relayer ----------------------------------------------------------------------
const claim = encodeFunctionData({ abi, functionName: 'claimAirdrop' })
const value = parseEther('2')
step('[2/3]', `Attack via the QoreConnect relayer: Drainer.claimAirdrop() with ${2} QOR`)
const pre = await relay.relay(await sign(DRAINER, claim, value), 'demo')
kv({ result: pre.body.preRejected ? 'REFUSED before broadcast (no fee spent)' : JSON.stringify(pre.body), code: `${pre.body.code} (chain code ${pre.body.chainCode})`, reason: pre.body.error })

// --- 3. Attack with the attacker's own relayer: straight to the chain -----------------------------------------------
step('[3/3]', "Attack via the attacker's OWN relayer: the signed call goes straight to the chain, no pre-check")
const signed = await sign(DRAINER, claim, value)
const msg = fromRelayRequest(signed, chain.relayerAddress)
let refusal: { tx?: string; code?: string; chainCode?: number; reason?: string; success?: boolean } = {}
try {
  const res = await chain.submit(msg, Number(signed.gasLimit))
  const [r] = decodeAuthenticatorExecutions(res as any, [msg])
  const code = r?.success ? undefined : classifyChainRefusal(r?.reason ?? (r as any)?.vmError, undefined)
  refusal = { tx: res.transactionHash, success: !!r?.success, code, chainCode: code ? CHAIN_CODES[code] : undefined, reason: r?.reason }
} catch (e: any) {
  const code = e?.code ?? classifyChainRefusal(String(e?.message), e?.chainCode)
  refusal = { tx: e?.txHash, success: false, code, chainCode: e?.chainCode ?? CHAIN_CODES[code as keyof typeof CHAIN_CODES], reason: [e?.message, e?.detail].filter(Boolean).join(' | ').slice(0, 300) }
}
kv({
  result: refusal.success ? 'EXECUTED (unexpected!)' : 'REFUSED BY THE CHAIN',
  code: `${refusal.code} (chain code ${refusal.chainCode ?? 'n/a'})`,
  reason: refusal.reason,
  tx: refusal.tx ?? '(rejected at CheckTx, no block inclusion)',
  explorer: refusal.tx ? explorerTx(DIANA, refusal.tx) : '-',
})

const stolen = !!refusal.success
console.log(`\n${stolen ? '\x1b[31mFAIL: the attack moved funds.' : '\x1b[32mPASS: the chain refused the attack. Funds stayed with the quantum-safe account.'}\x1b[0m  (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
console.log(JSON.stringify({ account: root.qorAddress, metamask: mmAcct.address, tipjar: TIPJAR, drainer: DRAINER, controlTx: tip.body.txHash, relayerRefusal: { code: pre.body.code, chainCode: pre.body.chainCode }, chainRefusal: refusal }))
root.lock()
process.exit(stolen ? 1 : 0)
