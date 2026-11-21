# @qoreconnect/wagmi

**Quantum-safe root. MetaMask convenience.** A wagmi connector that lets MetaMask users use QoreChain dApps with a
post-quantum (ML-DSA-87) root account. MetaMask signs as a capped, scoped, revocable session key; a relayer pays gas.

> Testnet only (QoreChain Diana, EVM chain id 9800). MetaMask's own key is classical (secp256k1) and is **not**
> quantum-safe: QoreConnect limits what it can do and lets the root revoke it in one transaction.

## Integration

```ts
import { createConfig } from 'wagmi'
import { qoreConnect, qoreTransport, qorechainDiana } from '@qoreconnect/wagmi'

export const config = createConfig({
  chains: [qorechainDiana],
  connectors: [qoreConnect({ appName: 'My dApp', contracts: ['0xMyContract'], relayerUrl: 'https://<relayer>', gasTankId: 'my-dapp' })],
  transports: { [qorechainDiana.id]: qoreTransport() },
})
```

Your components stay plain wagmi: `useWriteContract`, `useSendTransaction`, `useReadContract`,
`useWaitForTransactionReceipt` work unchanged.

## Notes

- **Accounts:** `useAccount().address` is the user's quantum-safe root account (it is `msg.sender` on chain).
  The MetaMask address is the session key: `provider.request({ method: 'qoreconnect_sessionKey' })`.
- **Why `qoreTransport()`:** relayed calls execute inside a QoreChain envelope, so plain EVM RPC has no receipt for
  them. `qoreTransport()` is the same JSON-RPC plus receipts for relayed calls. Event logs of relayed calls are not
  available from the EVM RPC on Diana yet; read state instead.
- **`personal_sign` / typed data** are forwarded to MetaMask and are classical signatures of the session key, not of
  the root account.
- **UI:** pass `ui` hooks (onboarding, approvals, signing preview) or use `@qoreconnect/react`.

Licence: Apache-2.0.
