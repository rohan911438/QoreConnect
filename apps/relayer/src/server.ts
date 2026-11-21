import { config } from 'dotenv'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { DIANA, QoreClient, type QoreNetwork } from '@qoreconnect/core'
import { ChainFundsSender, DEFAULT_SPONSOR, RelayerStore, SponsorService, createRelayerApp, operatorAccount } from '@qoreconnect/relayer'

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
if (!sponsorMnemonic) {
  console.error('SPONSOR_MNEMONIC is not set. See .env.example.')
  process.exit(1)
}

// Separate accounts by default: relayer = index 0 of RELAYER_MNEMONIC, sponsor = index of SPONSOR_INDEX (default 0).
const sponsorAccount = await operatorAccount(sponsorMnemonic, Number(process.env.SPONSOR_INDEX ?? 0))
const relayerAccount = await operatorAccount(relayerMnemonic!, Number(process.env.RELAYER_INDEX ?? 0))

const dbPath = resolve(process.env.RELAYER_DB ?? './data/relayer.db')
mkdirSync(dirname(dbPath), { recursive: true })
const store = new RelayerStore(dbPath)
const client = new QoreClient(net)

const sponsor = new SponsorService(
  net,
  store,
  new ChainFundsSender(net, sponsorAccount),
  {
    ...DEFAULT_SPONSOR,
    amountUqor: BigInt(process.env.SPONSOR_AMOUNT_UQOR ?? DEFAULT_SPONSOR.amountUqor),
    globalDailyBudgetUqor: BigInt(process.env.SPONSOR_DAILY_BUDGET_UQOR ?? DEFAULT_SPONSOR.globalDailyBudgetUqor),
  },
  async (root) => (await client.getPqcKey(root)).registered,
)

const app = createRelayerApp({
  net,
  store,
  sponsor,
  version: '0.1.0',
  accounts: { relayer: relayerAccount.cosmos, sponsor: sponsorAccount.cosmos },
  corsOrigins: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()),
})

const port = Number(process.env.RELAYER_PORT ?? 8787)
serve({ fetch: app.fetch, port }, (i) => console.log(`QoreConnect relayer on :${i.port} (sponsor ${sponsorAccount.cosmos}, relayer ${relayerAccount.cosmos})`))
