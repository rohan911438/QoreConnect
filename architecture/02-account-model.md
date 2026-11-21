# 02 — Account model

## Keys

| Key | Algorithm | Derived from | Held by | Used for |
|---|---|---|---|---|
| **Root classical key** | secp256k1 | BIP-39 seed, standard QoreChain derivation path | Browser vault | Classical half of hybrid signatures |
| **Root PQ key** | ML-DSA-87 (FIPS 204) | `derivePqcCanonical(address, mnemonic)` from `@qorechain/sdk` 0.14.0 | Browser vault | Post-quantum half of hybrid signatures; registered on-chain |
| **Session key** | secp256k1 (Ethereum address) | The user's existing MetaMask account | MetaMask | EIP-191 authorisations for `MsgExecuteEVM` |
| **Agent key** | secp256k1 (viem local account) | Generated per agent | Agent process | EIP-191 authorisations for the agent's capped actions |
| **Relayer key** | Hybrid (secp256k1 + ML-DSA-87) | Server mnemonic | Relayer env (secret) | Signs and pays for the envelope transaction |
| **Sponsor key** | Hybrid | Server mnemonic | Relayer env (secret) | Pays first-time fees |

The root account is a **standard QoreChain account** (`qor1...` and its `0x` encoding are the same 20 bytes). Nothing about it is QoreConnect-specific, so it can be used by the qorechaind CLI or imported into QoreX *(QoreX import verified in P01)*.

## On-chain state per user

```
Account qor1abc… (root)
├── PQC key: ML-DSA-87 pubkey (2,592 bytes), possessionProven = true
├── EVM window: (only where needed; scoped; see 03-flows.md)
├── Authenticators
│   ├── [eth] 0xMetaMaskAddress
│   │     permissions: ["evm"]
│   │     expiryUnix: now + 7 days
│   │     label: "metamask"
│   └── [eth] 0xAgentAddress           (optional, agent mode)
│         permissions: ["evm"]
│         expiryUnix: now + 24 hours
│         label: "agent:<name>"
└── Spending rules
    ├── rule "metamask" (bound to the MetaMask authenticator)
    │     enabled: true
    │     perTxLimit: 1 QOR
    │     dailyLimit: 5 QOR
    │     allowedDenoms: ["uqor"]
    │     allowed_evm_calls: ["0xDemoTarget", "0xOtherApprovedDapp/0xa9059cbb"]
    └── rule "agent:<name>"
          enabled: true
          perTxLimit: 0.5 QOR
          dailyLimit: 2 QOR
          allowed_evm_calls: ["0xAgentTarget/0xSELECTOR"]
```

Field names follow the docs (`perTxLimit` / `per_tx_limit`, `dailyLimit` / `daily_limit`, `allowedDenoms`, `denom_limits`, `allowed_evm_calls`). Exact JSON shape verified in P01.

## Rules we must respect (from the docs)

| Rule | Consequence for our design |
|---|---|
| **Linking is owner-signed** (normal hybrid transaction by the root account). Key-management messages cannot be sent by a linked key. | All link, rule and revoke operations go through the root vault and need a passkey tap. A compromised session key can never escalate. |
| **Possession proof required since v3.2.8** | Linking MetaMask needs one `personal_sign` of the 5-line text: `QoreChain authenticator link v1` / `chain: qorechain-diana` / `account: qor1…` / `scheme: <scheme>` / `key: <lowercase hex of 20-byte address>`. 65-byte r‖s‖v. Use `metaMaskPossessionProof`. |
| **SDK 0.14.0 and wallet-adapter 0.6.0 required** (older versions omit the proof field) | Pin these versions. |
| **`spendingRules` in `linkAuthenticatorMsgs` replaces all account rules** | Always read the current rules first (`fetchSpendingRules`), merge, then write the full set. Covered by a unit test. |
| **No enabled rule means NO limit**, and `enabled:false` means no limit (not zero) | Never write a disabled rule for a value-moving key. Invariant test: every linked key has an enabled rule bounding every denom. |
| **v3.2.8 refuses value-moving keys without a rule bounding every denom** (code 8) | Rules are created in the same transaction as the link. |
| **Rule resolution:** the authenticator's own enabled rule, else the first enabled account rule, else no limit | We bind a rule to each authenticator explicitly *(binding mechanism verified in P01)*. |
| **`allowed_evm_calls` does not stop bare value transfers** (no calldata), per one project's finding | Caps (`perTxLimit`, `dailyLimit`) are always set, so value transfers are still bounded. |
| **Per-authenticator nonce** (`fetchAuthNonce`), not the EVM nonce. Wrong nonce gives code 11. | The provider fetches the nonce before every signature; the relayer rejects stale nonces early. |
| **Digest v2** (includes gas limit) required since v3.2.3 | Always pass `digestVersion: "v2"` (or resolve with `resolveEvmAuthDigestVersion`). Relayer must use the same gas limit. |
| **Refused execution returns code 0 with `success=false`, and the nonce is consumed** | Relayer and provider check `assertAuthenticatorExecutionsSucceeded` / the `abstractaccount_execution_failed` event. |
| **Contract creation and EVM-nonce-advancing calls need `deploy` or `all`** | Session keys get `evm` only. Deploys are not supported through session keys (documented limitation). *(Whether ordinary calls advance the account EVM nonce is verified in P01.)* |
| **Revocation is owner-only**; pubkey passed as bytes | Kill switch builds one transaction with a `revokeAuthenticator` per classical key. |
| **Expiry** fails with code 6 | Dashboard shows expiry and offers one-tap renewal. |

## Error codes we surface in the UI

| Code | Meaning | UI message |
|---|---|---|
| 5 | Spending limit exceeded | "Blocked by chain: over your limit" |
| 6 | Session expired | "This key expired. Renew it?" |
| 8 | Value-moving key without a bounding rule | Internal bug; should never reach users |
| 9 | Module disabled (mainnet) | "QoreConnect runs on Diana testnet only for now" |
| 10 | Permission denied (not in allow-list) | "Blocked by chain: this dApp is not approved" |
| 11 | Replay / wrong nonce | Retry automatically once with a fresh nonce |

## Default policies

| Key | perTxLimit | dailyLimit | Expiry | Allow-list |
|---|---|---|---|---|
| MetaMask session key | 1 QOR | 5 QOR | 7 days | Contracts of dApps the user approved |
| AI agent key | 0.5 QOR | 2 QOR | 24 hours | The agent's task contracts and selectors only |

Users can change these in the dashboard (root-key transaction, passkey tap).
