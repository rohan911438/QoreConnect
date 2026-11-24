# @qoreconnect/relayer

**The self-hostable QoreConnect backend.** It submits MetaMask-signed `MsgExecuteEVM` transactions on QoreChain, pays
gas from dApp-funded gas tanks, sponsors new users' registration fee, and serves the Migration Meter, the account
Doctor, the Q-Day exposure report and the approval scanner. A [Hono](https://hono.dev) app you can run anywhere Node runs.

> **Testnet only** (QoreChain Diana). Use separate, testnet-only operator accounts; never a mainnet phrase. Not audited.

```bash
npm install @qoreconnect/relayer @qoreconnect/core @hono/node-server
```

Requires **Node 22.5+** (it uses the built-in `node:sqlite`, so there is no native module to build).

---

## What it does

| Service | Endpoint | What it does |
|---|---|---|
| **Relay** | `POST /v1/relay` · `GET /v1/relay/:txHash` | Takes a MetaMask-signed call, checks it against the account's chain rules first, wraps it in a hybrid (ML-DSA-87 + secp256k1) envelope, pays gas from the dApp's tank and submits it. Rate-limited per account and per IP. |
| **Sponsor** | `POST /v1/sponsor` | Pays a new user's ML-DSA key registration fee, authorised by their MetaMask link proof. Daily budget and per-IP limits. |
| **Gas tanks** | `GET /v1/tanks/:id` · `POST /v1/tanks` (admin) | Per-dApp budgets with a per-user daily cap and an optional contract allow-list. |
| **Spend tracking** | `GET /v1/accounts/:account/spent-today` · `/activity` | Today's spend and recent relayed calls, for previews and dashboards. |
| **Migration Meter** | `GET /v1/meter` · `/series` · `/evidence/:metric` | Measures how much of QoreChain's EVM activity has a post-quantum root, with evidence links. |
| **Doctor** | `GET /v1/doctor/:address` | Diagnoses an account in one call: PQC key, EVM window, linked key, rule, target, tank. Each failure comes with a fix. |
| **Exposure report** | `GET /v1/exposure/:address` | Grades any address A–F on how exposed it is on Q-Day, from live chain state. |
| **Approval scanner** | `GET /v1/approvals/:address` | Lists live ERC-20 and NFT approvals, including those made through relayed calls (rebuilt from the chain's tx search, so a restart loses nothing). |
| **Health** | `GET /health` | Version, operator accounts, balances and low-balance alerts. |

## Why run it

| | No relayer | Generic relayer / paymaster | **@qoreconnect/relayer** |
|---|---|---|---|
| MetaMask users on QoreChain | Cannot transact (no ML-DSA key) | Not built for QoreChain's hybrid envelope | **Relays MetaMask-signed `MsgExecuteEVM`** |
| Pays gas for users | No | Yes | **Yes**, from per-dApp tanks with per-user caps |
| Refuses calls the chain would reject | No | Usually after paying for them | **Pre-checks** limits, allow-list and expiry first |
| Trust | – | Often custodial | **Non-custodial**: it can only submit what the user's key signed, inside the root's limits |
| New-user fee | User pays | Not covered | **Sponsored** |
| Post-quantum tooling | – | – | Meter, Doctor, exposure report, approval scanner |

## Run it

The quickest way is the ready-made server in the repo:
[`apps/relayer`](https://github.com/rohan911438/QoreConnect/tree/main/apps/relayer) (Dockerfile included; set
`SPONSOR_MNEMONIC`, `RELAYER_MNEMONIC`, `ADMIN_TOKEN`).

Or build your own from this package:

```ts
import { serve } from '@hono/node-server'
import { DIANA, QoreClient } from '@qoreconnect/core'
import {
  RelayerStore, SponsorService, RelayService, ChainRelay, ChainFundsSender,
  DEFAULT_SPONSOR, operatorAccount, ensurePqcRegistered, createRelayerApp,
} from '@qoreconnect/relayer'

const net = DIANA
const sponsorAccount = await operatorAccount(process.env.SPONSOR_MNEMONIC!, 0)
const relayerAccount = await operatorAccount(process.env.RELAYER_MNEMONIC!, 1) // a different account

// Both operators sign hybrid transactions, so their ML-DSA-87 keys must be registered (no-op if already done).
for (const a of [sponsorAccount, relayerAccount]) await ensurePqcRegistered(net, a)

const store = new RelayerStore('./data/relayer.db')   // SQLite; ':memory:' for tests
const client = new QoreClient(net)

const sponsor = new SponsorService(net, store, new ChainFundsSender(net, sponsorAccount), DEFAULT_SPONSOR,
  async (root) => (await client.getPqcKey(root)).registered)
const relay = new RelayService(net, store, new ChainRelay(net, relayerAccount))

const app = createRelayerApp({
  net, store, sponsor, relay,
  adminToken: process.env.ADMIN_TOKEN,          // enables POST /v1/tanks
  corsOrigins: ['https://my-dapp.example'],
  trustProxyHops: 1,                             // behind one reverse proxy
})

serve({ fetch: app.fetch, port: 8787 })
```

### Create a gas tank for your dApp

```ts
store.createTank({
  id: 'my-dapp',
  name: 'My dApp',
  owner: 'me',
  balanceUqor: 50_000_000n,            // 50 QOR budget
  perUserDailyCapUqor: 2_000_000n,     // 2 QOR per user per day
  allowedContracts: ['0xYourContract'],
})
```

or over HTTP with `POST /v1/tanks` and `Authorization: Bearer <ADMIN_TOKEN>`. Then point the connector at it:
`qoreConnect({ relayerUrl: 'https://your-relayer', gasTankId: 'my-dapp', … })`.

### Optional services

```ts
import { MeterIndexer, RpcEvmSampler, RelayedApprovalIndex, restPages } from '@qoreconnect/relayer'

const meter = new MeterIndexer({ net, store, chain: client, sampler: new RpcEvmSampler(net.evmRpc) },
  { intervalMs: 15 * 60_000 })
const approvalIndex = new RelayedApprovalIndex(restPages(net.rest))
await approvalIndex.refresh()

createRelayerApp({ net, store, sponsor, relay, meter, approvalIndex /* … */ })
```

The building blocks are also exported for use without HTTP: `runDoctor`, `runExposure`, `computeMeter`,
`ApprovalScanner`.

## Security

- **Non-custodial.** The relayer cannot sign for a user. It submits calls the user's session key signed, and the chain
  enforces the root's limits regardless of what the relayer does.
- Sponsor and relayer **must be different accounts**; keep only small testnet balances on them.
- Request bodies are capped at 160 KB; relays are rate-limited (20 per account, 60 per IP per minute by default).
- `X-Forwarded-For` is ignored unless you set `trustProxyHops`, so clients cannot choose their own rate-limit bucket.
- It is a liveness dependency, not a trust dependency: if it is down, the root key can still act directly on chain.

Full threat model: [`docs/security.md`](https://github.com/rohan911438/QoreConnect/blob/main/docs/security.md).

## Related packages

- [`@qoreconnect/wagmi`](https://www.npmjs.com/package/@qoreconnect/wagmi): the connector dApps use to reach this relayer
- [`@qoreconnect/core`](https://www.npmjs.com/package/@qoreconnect/core): `RelayerClient` and the shared types
- [`@qoreconnect/react`](https://www.npmjs.com/package/@qoreconnect/react): the UI

Project: [QoreConnect](https://github.com/rohan911438/QoreConnect) · Live relayer: <https://qoreconnect-relayer.onrender.com/health>

Licence: Apache-2.0.
