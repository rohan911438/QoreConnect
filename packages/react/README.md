# @rohankumar4179/react

**The QoreConnect UI as React components.** Onboarding in about 20 seconds, a signing preview that never lets a user
sign blind, a contract approval sheet, and an unlock prompt. One line of setup in your app, no CSS to import.

> **Testnet only** (QoreChain Diana, EVM chain id 9800). Not audited; use small amounts.

```bash
npm install @rohankumar4179/react @rohankumar4179/wagmi
# peer dependencies: react >= 18, react-dom >= 18
```

---

## What the user sees

| Screen | When it appears | What it shows |
|---|---|---|
| **Onboarding** (`OnboardingModal`) | First visit: the MetaMask address has no QoreConnect account yet | A stepper: create the quantum-safe root (passkey tap) → one MetaMask signature → sponsored fee → register ML-DSA-87 key → link MetaMask. A new user needs **no QOR**. 19.8 s end to end on the live site. |
| **Signing preview** (`SigningPreview`) | Before every transaction, **before** MetaMask opens | The decoded function and arguments, the value in QOR, the simulation result, and checks against the per-tx limit, daily limit, allow-list and expiry. An honesty label: `Quantum-safe`, `Classical, capped`, `Agent, capped` or `Blocked by chain`. Calls the chain would refuse never reach MetaMask. |
| **Approve** (`ApproveSheet`) | The dApp calls a contract the user has not approved | The dApp, its origin, the contracts (with a check that they really are contracts) and the limits that will apply. One root-signed rule update. |
| **Unlock** (`UnlockPrompt`) | The root vault is locked and a root action is needed | Passkey or password prompt, with the reason. |

## Why use it

| | Typical wallet UX | **@rohankumar4179/react** |
|---|---|---|
| What the user signs | A raw hex digest in MetaMask | A **decoded, simulated** call with limits checked first |
| Calls that would fail | Signed, then fail on chain | **Blocked before signing**, with the reason |
| Unlimited token approvals | Easy to miss | Shown as `unlimited (2^256 − 1)`; on Diana the chain refuses them for linked keys |
| First-time setup | Install, fund with gas, bridge | **Passkey tap + one signature**, gas sponsored |
| Honesty about key safety | Not shown | Every screen says whether the signer is quantum-safe or classical and capped |
| Integration | Build each modal | **`createQoreConnectUI()` + one provider component** |

## How to use it (with wagmi)

```ts
// wagmi.ts
import { createConfig } from 'wagmi'
import { qoreConnect, qoreTransport, qorechainDiana } from '@rohankumar4179/wagmi'
import { createQoreConnectUI } from '@rohankumar4179/react'

export const ui = createQoreConnectUI()

export const config = createConfig({
  chains: [qorechainDiana],
  connectors: [
    qoreConnect({
      appName: 'My dApp',
      contracts: ['0xYourContract'],
      relayerUrl: 'https://your-relayer',
      gasTankId: 'my-dapp',
      ui: ui.hooks,                       // connects the connector to these screens
    }),
  ],
  transports: { [qorechainDiana.id]: qoreTransport() },
})
```

```tsx
// main.tsx
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { QoreConnectProvider } from '@rohankumar4179/react'
import { config, ui } from './wagmi'

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <WagmiProvider config={config}>
    <QueryClientProvider client={queryClient}>
      <QoreConnectProvider ui={ui}>
        <App />
      </QoreConnectProvider>
    </QueryClientProvider>
  </WagmiProvider>,
)
```

That's all. Your components keep using `useConnect`, `useWriteContract` and `useWaitForTransactionReceipt`; the
screens appear when they are needed.

### Options

```ts
createQoreConnectUI({
  showTimer: true,              // show the onboarding stopwatch
  forcePassword: false,         // password instead of passkey (browsers without WebAuthn PRF, automated tests)
  passkeyName: 'My dApp',       // name shown in the passkey dialog
  limits: { perTxUqor: 1_000_000n, dailyUqor: 5_000_000n },  // limits for newly linked keys (1 / 5 QOR)
  vault,                        // custom RootVault (default: this browser's IndexedDB vault)
})
```

### In a dashboard

```ts
const root = await ui.unlock('Change your limits')  // prompts only if the vault is locked
const already = ui.peek()                             // the unlocked root, or undefined; never prompts
```

### Using the components on their own

Every screen is exported for custom flows: `OnboardingModal`, `SigningPreview`, `ApproveSheet`, `UnlockPrompt` and
the base `Modal`. Styles are injected automatically; `QORECONNECT_STYLES` is exported if you want to restyle them.

```tsx
import { SigningPreview } from '@rohankumar4179/react'

<SigningPreview preview={preview} appName="My dApp" signerAddress={metamaskAddress}
  onConfirm={send} onCancel={close} />
```

`preview` comes from `buildPreview` in [`@rohankumar4179/core`](https://www.npmjs.com/package/@rohankumar4179/core).

## Related packages

- [`@rohankumar4179/wagmi`](https://www.npmjs.com/package/@rohankumar4179/wagmi): the wagmi connector these screens plug into
- [`@rohankumar4179/core`](https://www.npmjs.com/package/@rohankumar4179/core): vault, session keys, preview, provider
- [`@rohankumar4179/relayer`](https://www.npmjs.com/package/@rohankumar4179/relayer): the relayer your dApp points at

Project: [QoreConnect](https://github.com/rohan911438/QoreConnect) · Live demo dApp: <https://qoreconnect-demo.vercel.app>

Licence: Apache-2.0.
