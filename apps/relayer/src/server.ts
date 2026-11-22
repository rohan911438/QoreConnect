import { config } from 'dotenv'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { DIANA, QoreClient, type QoreNetwork } from '@qoreconnect/core'
import { ChainFundsSender, ChainRelay, ensurePqcRegistered, DEFAULT_SPONSOR, MeterIndexer, RelayService, RelayerStore, RpcEvmSampler, SponsorService, createRelayerApp, operatorAccount } from '@qoreconnect/relayer'

// Load the repo-root .env first, then a local one (local wins).
config({ path: resolve(import.meta.dirname, '../../../.env') })
config({ override: true })

const net: QoreNetwork = {
  ...DIANA,
  rest: process.env.QORE_REST ?? DIANA.rest,
  rpc: process.env.QORE_RPC ?? DIANA.rpc,
  evmRpc: process.env.QORE_EVM_RPC ?? DIANA.evmRpc,
}

const sponsorMnemonic = process.env.SPONSOR_MNEMONIC
const relayerMnemonic = process.env.RELAYER_MNEMONIC ?? sponsorMnemonic
const missing = ['SPONSOR_MNEMONIC', 'RELAYER_MNEMONIC', 'ADMIN_TOKEN'].filter((k) => !process.env[k])
if (missing.length) {
  console.error(`Missing required secrets: ${missing.join(', ')}. See .env.example.`)
  process.exit(1)
}
if (process.env.SPONSOR_MNEMONIC === process.env.RELAYER_MNEMONIC && (process.env.SPONSOR_INDEX ?? '0') === (process.env.RELAYER_INDEX ?? '0')) {
  console.error('Sponsor and relayer must be different accounts (set RELAYER_INDEX).')
  process.exit(1)
}

// Sponsor and relayer are separate accounts (SPONSOR_INDEX / RELAYER_INDEX on their mnemonics).
const sponsorAccount = await operatorAccount(sponsorMnemonic!, Number(process.env.SPONSOR_INDEX ?? 0))
const relayerAccount = await operatorAccount(relayerMnemonic!, Number(process.env.RELAYER_INDEX ?? 0))

// Both operator accounts sign hybrid transactions, so their ML-DSA-87 keys must be registered.
// SKIP_KEY_BOOTSTRAP=1 is only for container smoke tests with throwaway, unfunded keys.
for (const a of process.env.SKIP_KEY_BOOTSTRAP === '1' ? [] : [sponsorAccount, relayerAccount]) {
  const r = await ensurePqcRegistered(net, a)
  if (r.txHash) console.log(`registered ML-DSA key for ${a.cosmos}: ${r.txHash}`)
}

const dbPath = resolve(process.env.RELAYER_DB ?? './data/relayer.db')
mkdirSync(dirname(dbPath), { recursive: true })
const store = new RelayerStore(dbPath)
const client = new QoreClient(net)

// Hosts without a persistent disk (e.g. a free container plan) start with an empty database. BOOT_TANK=<id> creates that
// gas tank on boot if it is missing (same defaults as `pnpm seed`); BOOT_TANK_CONTRACTS limits it to these contracts.
const bootTank = process.env.BOOT_TANK?.trim()
if (bootTank && !store.getTank(bootTank)) {
  const allowed = (process.env.BOOT_TANK_CONTRACTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((a) => /^0x[0-9a-fA-F]{40}$/.test(a))
  store.createTank({
    id: bootTank,
    name: 'Quantum Tip Jar (demo)',
    owner: 'qoreconnect',
    balanceUqor: BigInt(process.env.BOOT_TANK_BALANCE_UQOR ?? 50_000_000),
    perUserDailyCapUqor: BigInt(process.env.BOOT_TANK_USER_DAILY_UQOR ?? 2_000_000),
    allowedContracts: allowed.length ? allowed : undefined,
  })
  console.log(`created gas tank ${bootTank} on boot (allowed contracts: ${allowed.length ? allowed.join(', ') : 'any'})`)
}

const sponsor = new SponsorService(
  net,
  store,
  new ChainFundsSender(net, sponsorAccount),
  {
    ...DEFAULT_SPONSOR,
    amountUqor: BigInt(process.env.SPONSOR_AMOUNT_UQOR ?? DEFAULT_SPONSOR.amountUqor),
    globalDailyBudgetUqor: BigInt(process.env.SPONSOR_DAILY_BUDGET_UQOR ?? DEFAULT_SPONSOR.globalDailyBudgetUqor),
    perIpPerDay: Number(process.env.SPONSOR_PER_IP_PER_DAY ?? DEFAULT_SPONSOR.perIpPerDay),
  },
  async (root) => (await client.getPqcKey(root)).registered,
)

const relay = new RelayService(net, store, new ChainRelay(net, relayerAccount))

// Migration Meter indexer (docs/migration-meter.md). METER_INTERVAL_MS=0 disables it.
const meterInterval = Number(process.env.METER_INTERVAL_MS ?? 15 * 60_000)
const meter = meterInterval > 0
  ? new MeterIndexer(
      { net, store, chain: client, sampler: new RpcEvmSampler(net.evmRpc) },
      {
        intervalMs: meterInterval,
        publicUrl: process.env.RELAYER_PUBLIC_URL,
        sampleBlocks: Number(process.env.METER_SAMPLE_BLOCKS ?? 200),
        maxSenders: Number(process.env.METER_MAX_SENDERS ?? 50),
        log: (m) => console.log(m),
      },
    )
  : undefined

const app = createRelayerApp({
  meter,
  net,
  store,
  sponsor,
  relay,
  adminToken: process.env.ADMIN_TOKEN,
  version: '0.1.0',
  accounts: { relayer: relayerAccount.cosmos, sponsor: sponsorAccount.cosmos },
  corsOrigins: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()),
  // Behind a reverse proxy (e.g. a container platform), set TRUST_PROXY_HOPS=1 so rate limits key on the real client.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 0),
})

const port = Number(process.env.RELAYER_PORT ?? 8787)
serve({ fetch: app.fetch, port }, (i) => console.log(`QoreConnect relayer on :${i.port} (sponsor ${sponsorAccount.cosmos}, relayer ${relayerAccount.cosmos})`))
meter?.start()
