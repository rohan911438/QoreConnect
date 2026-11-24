# @rohankumar4179/wagmi

**Quantum-safe root. MetaMask convenience.** A wagmi connector that lets any MetaMask user use your dApp on QoreChain,
with a post-quantum (ML-DSA-87) root account in control. MetaMask signs as a capped, scoped, revocable session key; a
relayer pays gas. **9 lines** to integrate; your existing wagmi code does not change.

> **Testnet only** (QoreChain Diana, EVM chain id 9800). MetaMask's own key is classical (secp256k1) and is **not**
> quantum-safe: QoreConnect limits what it can do and lets the root revoke it in one transaction. Not audited.

```bash
npm install @rohankumar4179/wagmi @rohankumar4179/react wagmi@2 viem @tanstack/react-query
```

Requires wagmi **v2** (`@wagmi/core` ^2.22). wagmi v3 is not tested yet.

---

## The problem it solves

QoreChain only accepts EVM transactions from accounts with a registered ML-DSA-87 key. MetaMask cannot hold that key,
so without QoreConnect **a MetaMask user cannot send a single transaction to your QoreChain dApp**.

| | Plain `injected()` / MetaMask connector | Build it yourself | **`qoreConnect()`** |
|---|---|---|---|
| MetaMask user can transact on QoreChain | No | Yes, after building key setup, onboarding and a relayer | **Yes** |
| User needs QOR for gas | Yes | Depends | **No**: gas tanks you fund pay it |
| Steps for a first transaction | Not possible | Many | **1 passkey tap + 1 MetaMask signature** |
| Damage if the MetaMask key leaks | Everything | Depends | **Capped** by per-tx and daily limits, only on your approved contracts |
| Signing UX | Raw digest | Build it | **Decoded, simulated preview** before MetaMask opens |
| Your wagmi hooks | Unchanged | Rewritten for the relayer | **Unchanged** |
| Lines to integrate | 1 (but cannot transact) | Thousands | **9** |

## Integrate in 9 lines

```ts
import { createConfig } from 'wagmi'
import { qoreConnect, qoreTransport, qorechainDiana } from '@rohankumar4179/wagmi'
import { createQoreConnectUI } from '@rohankumar4179/react'

export const ui = createQoreConnectUI()            // onboarding, approval and signing-preview screens

export const config = createConfig({
  chains: [qorechainDiana],
  connectors: [
    qoreConnect({
      appName: 'My dApp',
      contracts: ['0xYourContract'],                // what users approve for your dApp
      relayerUrl: 'https://your-relayer',            // a @rohankumar4179/relayer server
      gasTankId: 'my-dapp',                          // the gas tank that pays your users' fees
      ui: ui.hooks,
    }),
  ],
  transports: { [qorechainDiana.id]: qoreTransport() },  // drop-in for http()
})
```

Then render `<QoreConnectProvider ui={ui}>` from `@rohankumar4179/react` once, inside `WagmiProvider`.

Your components stay plain wagmi:

```tsx
const { connect, connectors } = useConnect()
const { writeContract, data: hash } = useWriteContract()
const { isSuccess } = useWaitForTransactionReceipt({ hash })

<button onClick={() => connect({ connector: connectors[0] })}>Connect</button>
<button onClick={() => writeContract({ address: TIPJAR, abi, functionName: 'tip', args: [creator, 'gm'], value: parseEther('0.1') })}>
  Tip 0.1 QOR
</button>
```

## What happens on `writeContract`

1. **Preview.** The call is decoded, simulated and checked against the user's limits and allow-list. If the chain
   would refuse it, the user sees why and MetaMask is never asked.
2. **Approve (first time only).** If your contract is not in the user's allow-list, they approve it with one
   root-signed update.
3. **Sign.** MetaMask signs once, as the session key.
4. **Relay.** The relayer wraps it in a hybrid QoreChain envelope, pays gas from your gas tank and submits it.
5. **Receipt.** `qoreTransport()` returns the receipt, so `useWaitForTransactionReceipt` works unchanged.

On chain, `msg.sender` is the user's **quantum-safe root account**, not the MetaMask address.

## API

### `qoreConnect(parameters)`

| Parameter | Type | Description |
|---|---|---|
| `appName` | `string` | Shown on onboarding and approval screens. |
| `contracts` | `string[]` | Contracts users approve for this dApp: `"0xTarget"`, or `"0xTarget/0xSelector"` to allow one function only. |
| `relayerUrl` | `string` | Your QoreConnect relayer. |
| `gasTankId` | `string` | Gas tank that pays your users' fees. |
| `ui` | `QoreConnectHooks` | UI hooks; `createQoreConnectUI().hooks` from `@rohankumar4179/react`, or your own. |
| `announce` | `boolean` | Announce QoreConnect over EIP-6963 so pickers like RainbowKit list it (default `true`). |
| `advanced` | object | `abis` (readable previews by contract address), `net`, `metamask`, `vault`, `fetch`, `fourByte`. |

Readable previews for your own contracts:

```ts
qoreConnect({ /* … */ advanced: { abis: { [TIPJAR]: { abi: tipJarAbi, name: 'Quantum Tip Jar' } } } })
```

### `qoreTransport(opts?)`

Same JSON-RPC as `http('https://evm-testnet.qore.host')`, plus receipts for relayed calls. Relayed calls execute inside a
QoreChain envelope, so the plain EVM RPC returns `null` for their receipts.

### `qorechainDiana`

The QoreChain Diana testnet as a viem `Chain` (id 9800, RPC, WebSocket, explorer), defined with your app's own viem.

## Notes

- **Accounts:** `useAccount().address` is the user's quantum-safe root (it is `msg.sender` on chain). The MetaMask
  address is the session key: `provider.request({ method: 'qoreconnect_sessionKey' })`.
- **Event logs** of relayed calls are not available from the EVM RPC on Diana yet; read contract state instead.
- **`personal_sign` / typed data** are forwarded to MetaMask: they are classical signatures of the session key, not of
  the root account.
- **Chain:** QoreChain (9800) only; `switchChain` to any other chain throws.

## Try it

- Live demo dApp (Quantum Tip Jar): <https://qoreconnect-demo.vercel.app>
- Source of that integration: [`apps/demo-dapp/src/wagmi.ts`](https://github.com/rohan911438/QoreConnect/blob/main/apps/demo-dapp/src/wagmi.ts)

## Related packages

- [`@rohankumar4179/react`](https://www.npmjs.com/package/@rohankumar4179/react): the screens
- [`@rohankumar4179/core`](https://www.npmjs.com/package/@rohankumar4179/core): vault, session keys, preview, provider
- [`@rohankumar4179/relayer`](https://www.npmjs.com/package/@rohankumar4179/relayer): run your own relayer and gas tank

Project: [QoreConnect](https://github.com/rohan911438/QoreConnect)

Licence: Apache-2.0.
