# 06 — Security and threat model

## Assets

| Asset | Value |
|---|---|
| User funds in the root account | Primary |
| Root key (seed) | Total control of the account |
| Session key (MetaMask) | Capped spending through approved contracts |
| Agent keys | Capped spending for one task |
| Relayer and sponsor balances | Operator funds |
| Gas tank budgets | dApp funds |

## Adversaries

1. **Quantum adversary** (future): can derive secp256k1 private keys from public keys and signatures seen on-chain.
2. **Phishing dApp**: tricks the user into signing a harmful transaction or approving a drainer contract.
3. **Prompt injection**: a web page or tool output tries to command the AI agent.
4. **Malicious or compromised relayer**: tries to alter, replay, censor or reorder transactions.
5. **Sponsor abuser**: farms sponsored funds with many fake accounts.
6. **Device thief**: has the user's unlocked laptop or browser profile.
7. **Supply chain**: a compromised npm dependency.

## Threats and mitigations

| # | Threat | Mitigation | Residual risk |
|---|---|---|---|
| T1 | **Quantum attacker breaks the MetaMask key** | MetaMask is only a session key: caps, allow-list and expiry limit the damage; the root key is ML-DSA-87 (hybrid); Q-Day kill switch revokes every classical key in one transaction | Up to one day's cap through approved contracts until revoked |
| T2 | **Quantum attacker breaks the root's secp256k1 half** | Native-lane transactions require **both** signatures (hybrid); the ML-DSA-87 half remains secure | None known, per QoreChain's hybrid model |
| T3 | **Phishing dApp asks for a harmful call** | Readable preview with simulation; allow-list blocks unapproved contracts; caps bound the rest | User approves a harmful call to an approved contract, up to the cap |
| T4 | **Phishing dApp asks to approve a drainer contract** | Approval sheet shows the contract addresses and the dApp origin; caps unchanged by approval; warning for unverified contracts | User approves anyway; loss bounded by caps |
| T5 | **Blind signing in MetaMask** (raw digest) | Our preview runs before MetaMask; the digest is built locally from the previewed transaction; preview and digest come from the same object | MetaMask itself still shows a hex digest |
| T6 | **Relayer alters the transaction** | The chain verifies the session key's signature over the digest (v2 includes gas limit); any change invalidates it | None |
| T7 | **Relayer replays a transaction** | Per-authenticator nonce; code 11 on replay | None |
| T8 | **Relayer censors** | Self-hostable relayer; the SDK accepts any relayer URL; the user can always act with the root key directly | Liveness only |
| T9 | **Relayer lies about the result** | The SDK verifies the transaction on-chain by hash (REST) before showing success | None |
| T10 | **Prompt injection commands the agent** | Agent executes only root-signed instructions (verified against the registered key); model output is constrained to the signed task; chain enforces caps and allow-list regardless | A bug in the agent's instruction check; still bounded by caps |
| T11 | **Rule replacement wipes existing rules** | Always read-merge-write; unit test and invariant check after every rule update | Bug in merge logic (tested) |
| T12 | **"No enabled rule = no limit"** | Invariant: every linked value-moving key has an enabled rule bounding every denom; checked after every transaction; Doctor flags violations | None if invariant holds |
| T13 | **Bare value transfer bypasses `allowed_evm_calls`** | Caps always set | Value transfer up to the cap |
| T14 | **Sponsor farming** | One sponsorship per MetaMask address; per-IP limits; possession proof required; tiny amounts | Low-cost abuse within global budget |
| T15 | **Device thief with unlocked browser** | Seed encrypted at rest; root operations require a fresh passkey assertion (user verification) each time | Session-key transactions need MetaMask unlock, which the thief may also have; bounded by caps |
| T16 | **Lost device** | Recovery code; progressive backup prompts | User never saved the code |
| T17 | **XSS in the web app reads the decrypted seed** | Strict CSP, no third-party scripts on vault pages, decrypt only inside a short-lived function, never store plaintext | Same-origin compromise |
| T18 | **Supply-chain attack** | Pin dependencies (lockfile); minimal dependency set; only official `@qorechain/*` kits for crypto | Upstream compromise |
| T19 | **Secrets leak from the repo** | `.env` ignored; secret scanning in CI; separate relayer and sponsor accounts | Operator mistake |

## Invariants (tested automatically)

1. Every linked authenticator with `evm`, `send`, `deploy` or `all` has an **enabled** rule with a finite `perTxLimit` and `dailyLimit` for every allowed denom.
2. After any rule update, all previous rules still exist unless explicitly removed.
3. The relayer never broadcasts a message whose nonce does not match `fetchAuthNonce`.
4. The SDK never reports success unless the on-chain execution event says `success=true`.
5. No private key or seed is ever sent over the network.

## Honest limitations (published in the README)

- The MetaMask key is classical. It is capped, scoped and revocable, not quantum-safe.
- MetaMask displays a raw digest; users must rely on our preview.
- Abstract accounts are disabled on mainnet; QoreConnect runs on Diana testnet.
- The relayer is a liveness dependency (self-hostable; the root key can always act directly).
- Passkey PRF is not supported in every browser; the fallback is password-based encryption.
- Not audited. Use small amounts.
