# @qoreconnect/core

**Quantum-safe root. MetaMask convenience.** The engine behind QoreConnect: a post-quantum (ML-DSA-87) root account
in the browser, MetaMask linked as a capped session key, a signing preview that never lets the user sign blind, and an
EIP-1193 provider any EVM dApp can use on QoreChain.

> **Testnet only** (QoreChain Diana, EVM chain id 9800). Abstract accounts are switched off on QoreChain mainnet.
> Not audited; use small amounts.

```bash
npm install @qoreconnect/core
```

Most dApps should not use this package directly: use [`@qoreconnect/wagmi`](https://www.npmjs.com/package/@qoreconnect/wagmi)
(a wagmi connector) and [`@qoreconnect/react`](https://www.npmjs.com/package/@qoreconnect/react) (the UI). Use `core`
when you build a wallet, a dashboard, an agent, or a non-wagmi integration.

---

## Why it exists

QoreChain only accepts EVM transactions from accounts that have a registered post-quantum (ML-DSA-87) key. MetaMask
cannot hold that key, so a MetaMask user cannot send a single transaction to a QoreChain EVM dApp. Every dApp team would
otherwise rebuild the same key setup, onboarding and relayer code.

`@qoreconnect/core` solves it once:

| | MetaMask alone | Write it yourself | **@qoreconnect/core** |
|---|---|---|---|
| Send an EVM tx on QoreChain | Not possible (no ML-DSA key) | Possible, after weeks of work | **1 passkey tap + 1 MetaMask signature** |
| Who is in control | The classical key, fully | Whatever you build | **The ML-DSA-87 root**; MetaMask is capped |
| Loss if the MetaMask key is broken | Everything | Depends | **At most the daily limit**, only through approved contracts, until revoked |
| Limits enforced by | Nobody | Your code | **The chain** (`x/abstractaccount` spending rules) |
| Q-Day response | None | Build it | **`revokeKeys('all-classical')`**: every classical key, one tx |
| Signing UX | Raw hex digest | Build it | **Decoded, simulated, checked** preview with an honesty label |
| Gas for new users | They need QOR | Build a faucet | **Sponsored** by the relayer, no QOR needed |
| AI agents | Give the bot a key | Build it | **Capped sub-account**, acts only on root-signed instructions |

## What's inside

| Area | Exports | What it does |
|---|---|---|
| Root vault | `RootVault`, `RootSigner`, `WebAuthnPasskeyProvider`, `IndexedDbVaultStorage`, `MemoryVaultStorage` | Creates an ML-DSA-87 + secp256k1 root, encrypted on the device with a passkey (WebAuthn PRF) or a password (scrypt). Recovery code export and restore. Auto-locks after 5 minutes. |
| Onboarding | `onboardAndLink`, `onboardRoot`, `requestSponsorship` | The whole first-run flow in one idempotent call: create root → one MetaMask signature → sponsored fee → register ML-DSA key → link MetaMask. Safe to retry. |
| Session keys | `linkSessionKey`, `renewSessionKey`, `getSessionState`, `approveDapp`, `removeDapp`, `setLimits`, `revokeKeys` | Link MetaMask with per-transaction and daily limits and an allow-list of contracts; change or revoke them with root-signed transactions. |
| Limit presets | `LIMIT_PRESETS`, `presetLimits`, `describeLimits`, `matchPreset` | Cautious, Everyday, Agent and Gaming presets, plus plain-English "can / cannot" text. |
| Token approvals | `approvalInCalldata`, `revokeCalldata`, `prepareTokenRevoke` | Detect ERC-20 / NFT approvals in calldata and revoke them. |
| EIP-1193 provider | `QoreConnectProvider`, `discoverMetaMask`, `announceProvider` | A standard provider for dApps. Accounts are the quantum-safe root; MetaMask signs; the relayer pays gas. Announced over EIP-6963 so wallet pickers list it. |
| Signing preview | `buildPreview`, `decodeCall` | Decodes the call (ABI, known selectors, 4byte), simulates it and checks it against the chain's rules **before** MetaMask is asked to sign. |
| Relayer client | `RelayerClient`, `signRelayRequest` | Talk to a QoreConnect relayer (`@qoreconnect/relayer`). |
| Agents | `createAgent`, `signInstruction`, `verifyInstruction`, `listAgents`, `revokeAgent`, `reclaimAgentFunds` | Give an AI agent its own funded, capped sub-account that only acts on ML-DSA-87-signed instructions from the root. |
| Chain | `QoreClient`, `DIANA`, `formatQor`, `parseQor`, `explorerTx` | Read keys, authenticators, spending rules, balances; network config and unit helpers. |
| Errors | `QoreConnectError`, `userMessage`, `classifyChainRefusal` | Typed error codes (`LIMIT_EXCEEDED`, `NOT_APPROVED`, `REVOKED`, `TANK_EMPTY`, …) with user-facing messages. |

## How to use it

### 1. Use it as a provider in any EVM dApp

```ts
import { QoreConnectProvider } from '@qoreconnect/core'
import { createWalletClient, custom } from 'viem'

const provider = new QoreConnectProvider({
  appName: 'My dApp',
  contracts: ['0xYourContract'],          // or '0xTarget/0xSelector' to allow one function only
  relayerUrl: 'https://your-relayer',      // a @qoreconnect/relayer server
  gasTankId: 'my-dapp',                    // gas tank that pays your users' fees
})

const [account] = await provider.request({ method: 'eth_requestAccounts' }) // the user's quantum-safe root
const wallet = createWalletClient({ transport: custom(provider) })
await wallet.sendTransaction({ account, to: '0xYourContract', data: '0x…' })
```

`eth_sendTransaction` builds the preview, asks MetaMask for one signature as the session key, and sends it through the
relayer. Pass `hooks` (or use `@qoreconnect/react`) to show onboarding, approval and preview screens.

Extra RPC methods: `qoreconnect_sessionKey` (the MetaMask address) and `qoreconnect_root` (the root account).

### 2. Onboard a user in one call

```ts
import { DIANA, RootVault, WebAuthnPasskeyProvider, onboardAndLink, presetLimits, presetById } from '@qoreconnect/core'

const result = await onboardAndLink({
  net: DIANA,
  vault: new RootVault(),                                       // IndexedDB in the browser
  protection: { kind: 'passkey', passkey: new WebAuthnPasskeyProvider({ name: 'My dApp' }) },
  // or: protection: { kind: 'password', password: '…' }
  metamask: window.ethereum,
  relayerUrl: 'https://your-relayer',
  contracts: ['0xYourContract'],
  limits: presetLimits(presetById('everyday')!),               // 1 QOR per tx, 5 QOR per day
  onEvent: (e) => console.log(e.step),                          // creating → signing → sponsoring → registering → linking → done
})
console.log(result.root.qorAddress, `${result.ms} ms`)
```

### 3. Manage the account (dashboards)

```ts
import { DIANA, RootVault, getSessionState, setLimits, approveDapp, revokeKeys, parseQor } from '@qoreconnect/core'

const root = await new RootVault().unlock({ kind: 'password', password: '…' })
const ctx = { net: DIANA, root }

const state = await getSessionState(ctx, root.qorAddress)   // keys, rules, approved contracts
await setLimits({ ...ctx, limits: { perTxUqor: parseQor('0.5'), dailyUqor: parseQor('2') } })
await approveDapp({ ...ctx, contracts: ['0xAnotherContract'] })

// Q-Day kill switch: revoke every classical (MetaMask) key in one root-signed transaction.
await revokeKeys({ ...ctx, keys: 'all-classical' })
```

### 4. Show a preview before anything is signed

```ts
import { buildPreview } from '@qoreconnect/core'

const preview = await buildPreview(call, { net: DIANA, rootEvm, rule, approved })
preview.label      // 'Quantum-safe' | 'Classical, capped' | 'Agent, capped' | 'Blocked by chain'
preview.summary    // one plain sentence
preview.checks     // per-tx limit, daily limit, allow-list, expiry
preview.blocked    // the chain would refuse it: do not ask MetaMask
preview.willFail   // the call would revert
```

### 5. Give an AI agent a capped account

```ts
import { createAgent, verifyInstruction } from '@qoreconnect/core'

// Root side: fund a sub-account, link the agent's key with tight limits, sign its instructions with ML-DSA-87.
const agent = await createAgent({
  net: DIANA, root, index: 1,
  name: 'Tipper', task: 'Tip creators I follow, max 0.1 QOR each',
  calls: [{ to: '0xTipJar', signature: 'function tip(address creator, string note) payable' }],
  limits: { perTxUqor: 100_000n, dailyUqor: 500_000n },
  fundUqor: 1_000_000n,
  agentProof,                       // the agent's possession proof for its own key
})

// Agent side: refuse anything the root did not sign. Prompt injection cannot add a call or raise a limit.
const ok = verifyInstruction(agent.signed, { rootPublicKey, chainId: DIANA.chainId, agent: agentAddress, owner })
```

A complete agent is in [`examples/agent`](https://github.com/rohan911438/QoreConnect/tree/main/examples/agent).

## Honest limitations

- The MetaMask key is **classical** (secp256k1): capped, scoped and revocable, not quantum-safe. The root is the
  quantum-safe part.
- MetaMask itself shows a raw digest; QoreConnect's preview is what the user should read.
- Passkey PRF is not available in every browser; the fallback is a password.
- The relayer is a liveness dependency. It is self-hostable, and the root key can always act directly.

## Related packages

- [`@qoreconnect/wagmi`](https://www.npmjs.com/package/@qoreconnect/wagmi): wagmi connector built on this provider
- [`@qoreconnect/react`](https://www.npmjs.com/package/@qoreconnect/react): onboarding, approval, preview and unlock UI
- [`@qoreconnect/relayer`](https://www.npmjs.com/package/@qoreconnect/relayer): the relayer, sponsor and gas tanks

Built on QoreChain's [`@qorechain/sdk`](https://www.npmjs.com/package/@qorechain/sdk) and
[`@qorechain/pqc`](https://www.npmjs.com/package/@qorechain/pqc). Project: [QoreConnect](https://github.com/rohan911438/QoreConnect) ·
Live app: <https://qoreconnect-web.vercel.app>

Licence: Apache-2.0.
