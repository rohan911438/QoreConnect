# 05 — SDK design

Three packages for developers, one internal core.

| Package | Audience | Contents |
|---|---|---|
| `@rohankumar4179/core` | Internal and advanced users | Root vault, chain client, EIP-1193 provider, preview builder, Doctor client |
| `@rohankumar4179/wagmi` | dApp developers (main entry point) | wagmi connector, EIP-6963 announcement |
| `@rohankumar4179/react` | dApp developers using React | Onboarding modal, signing preview, approve-dApp sheet, honesty badges, `QoreConnectProvider` |
| `@rohankumar4179/relayer` | Teams self-hosting | Relayer server as a library + CLI |

## The 5-line integration (target developer experience)

```ts
import { qoreConnect } from '@rohankumar4179/wagmi'
import { qorechainTestnet } from '@qorechain/evm'

export const config = createConfig({
  chains: [qorechainTestnet],
  connectors: [
    qoreConnect({
      appName: 'My dApp',
      contracts: ['0xMyContract'],            // what users approve
      relayerUrl: 'https://relay.qoreconnect.xyz',
      gasTankId: 'my-dapp',
    }),
  ],
  transports: { [qorechainTestnet.id]: http('https://evm-testnet.qore.host') },
})
```

```tsx
// Optional: built-in UI (onboarding, preview, approvals)
<QoreConnectProvider config={config}>
  <App />
</QoreConnectProvider>
```

After this, existing `useWriteContract`, `useSendTransaction`, `useReadContract` and `useBalance` calls work unchanged.

## EIP-1193 provider: method routing

| Method | Handling |
|---|---|
| `eth_requestAccounts`, `eth_accounts` | Return the **root account's 0x address** (the account that holds funds and executes). Also expose the MetaMask address via a custom method. *(Which address dApps should see is confirmed in P01: the EVM `msg.sender` for authenticator executions must be the root account.)* |
| `eth_chainId` | `0x2648` (9800) |
| `eth_sendTransaction` | Preview → `buildMetaMaskExecuteEvm` → relayer → wait → return the inner EVM transaction hash |
| `eth_call`, `eth_estimateGas`, `eth_getBalance`, `eth_getTransactionReceipt`, `eth_blockNumber`, logs, etc. | Pass through to `https://evm-testnet.qore.host` |
| `personal_sign`, `eth_signTypedData_v4` | Forward to MetaMask, but **warn** in the UI that these signatures are classical and are not root-account signatures *(dApps using SIWE need adjustment; documented)* |
| `wallet_switchEthereumChain`, `wallet_addEthereumChain` | Accept only 9800 |
| `wallet_sendCalls` (EIP-5792) | Stretch: batch several calls into one relay if the chain supports multiple messages per envelope |
| Events | Emit `accountsChanged`, `chainChanged`, `connect`, `disconnect` correctly (QoreX does not, which breaks wagmi) |

## Core API sketch

```ts
// vault
createRootVault({ passkey: true }): Promise<RootVault>
unlockRootVault(): Promise<RootVault>
vault.address              // qor1…
vault.evmAddress           // 0x…
vault.exportRecoveryCode()
vault.signAndBroadcast(msgs)  // hybrid

// account management (all root-signed)
onboard({ metamask, contracts, limits }): Promise<OnboardResult>
approveDapp({ contracts }): Promise<TxResult>
setLimits({ perTx, daily, denoms }): Promise<TxResult>
revoke(keys | 'all-classical'): Promise<TxResult>
linkAgent({ agentAddress, contracts, limits, expiry }): Promise<TxResult>
signInstruction(instruction): Promise<SignedInstruction>   // QoreSign message signing

// reads
getAccountState(address): Promise<{ pqc, windows, authenticators, rules }>
doctor(address, target?): Promise<DoctorReport>

// execution
buildPreview(tx): Promise<Preview>   // decode, simulate, policy check, label
execute(tx): Promise<{ evmTxHash }>
```

## Error model

All SDK functions throw `QoreConnectError` with:
- `code`: our code (`LIMIT_EXCEEDED`, `NOT_APPROVED`, `EXPIRED`, `NONCE`, `MODULE_DISABLED`, `RELAYER_UNAVAILABLE`, `TANK_EMPTY`, `USER_REJECTED`, …)
- `chainCode`: the raw chain code where applicable (5, 6, 8, 9, 10, 11)
- `message`: a sentence a user can read
- `txHash` when a transaction was involved

## Versioning and publishing

- All packages versioned together (changesets).
- Published to npm under `@qoreconnect` (scope to be created; fallback: unscoped `qoreconnect-*` names).
- Pin `@qorechain/sdk@0.14.0` and `@qorechain/wallet-adapter@0.6.0` exactly (possession-proof support).
- ESM + CJS builds with type declarations (tsup).
