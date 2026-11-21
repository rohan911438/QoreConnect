# 05 — Scope and non-goals

We have 11 days (22 Nov to 2 Dec 2026). Scope discipline decides whether we ship a polished product or a half-finished one.

---

## Must have (the submission fails without these)

| # | Feature | Why it is required |
|---|---|---|
| M1 | **Root key vault**: seed generation in browser, SDK derivation of the QoreChain account and ML-DSA-87 key, passkey-unlocked encryption, recovery code export | The foundation of the security model |
| M2 | **Sponsored onboarding**: sponsor-paid ML-DSA-87 key registration for the new account | Removes faucet and gas homework |
| M3 | **MetaMask linking**: possession proof via `personal_sign`, link with default spending rule in one root-key transaction | The session-key model |
| M4 | **Relayer**: accepts MetaMask-signed `MsgExecuteEVM`, wraps in its own hybrid-signed transaction, pays fees, checks `success` (not just code 0) | Users cannot submit EVM transactions otherwise |
| M5 | **wagmi connector + EIP-1193 provider**: routes `eth_sendTransaction` through QoreConnect; reads pass through to EVM RPC | The 5-line developer integration |
| M6 | **Readable signing preview**: decoded call, value, simulation, policy check, honesty label | "Never sign blind" |
| M7 | **Dashboard**: approved dApps, limits, per-key revoke, Q-Day kill switch | Control and the demo's key moments |
| M8 | **Demo dApp + Foundry contract + tests**: a target contract the demo calls, plus a malicious one for the attack demo | Shows the product end to end |
| M9 | **Submission package**: README, Apache-2.0 LICENSE, `AI_USAGE.md`, video, cover, testnet addresses | Fest rules |

## Should have (strongly improves our chances)

| # | Feature | Value |
|---|---|---|
| S1 | **Per-dApp approval flow**: approving a second dApp adds its contracts to the allow-list with one passkey tap | Deep security story |
| S2 | **Gas tanks**: per-dApp budget, per-user daily cap, rate limit | Paymaster model; sustainable relayer |
| S3 | **Migration Meter** public page | Roadmap alignment; People's Choice |
| S4 | **Agent mode**: issue a capped key to an AI agent, with root-signed instructions | Main-category fit; AI-Native award |
| S5 | **Doctor**: "why will this account's next transaction fail?" | Developer value |
| S6 | **Published npm packages** and an integration guide | Other teams can integrate before the deadline |

## Could have (only if ahead of schedule)

| # | Feature |
|---|---|
| C1 | "Move to QoreX" guided export (if P01 confirms QoreX can import the seed) |
| C2 | Native-lane actions for MetaMask users (send QOR, swap) via `buildMetaMaskExecuteCosmos` |
| C3 | Telegram or Discord bot that reports Migration Meter numbers |
| C4 | Password-based fallback for browsers without passkey PRF support |

---

## Non-goals (we will not build these)

| Non-goal | Reason |
|---|---|
| A new wallet or browser extension | Our point is that users keep MetaMask |
| A chat interface or AI copilot | Rejected idea; the agent mode stays minimal |
| Mainnet deployment | Abstract accounts are disabled on mainnet; judging is on testnet |
| Phantom / Solana support | SVM lane is closed; scope |
| Hardhat or Foundry plugins for deployment | Developer tooling beyond the connector is out of scope |
| A MetaMask Snap holding the ML-DSA key | Interesting future direction (would let MetaMask sign hybrid), but production Snaps need allowlisting; listed in the roadmap section of the README only |
| Contract verification / explorer features | Not our problem to solve |
| Custom cryptography | We only use the official `@qorechain/*` kits |
| Token, points or fees for QoreConnect | Not needed; avoids any appearance of a token launch |

---

## Cut order if we fall behind

If the schedule slips, cut in this order (first cut first):

1. C1 to C4 (all "could have")
2. S5 Doctor (fold a minimal version into the dashboard)
3. S3 Migration Meter (reduce to a static snapshot page)
4. S2 Gas tanks (keep a single global sponsor budget)
5. S1 Per-dApp approval (keep a fixed allow-list per link)

**Never cut:** M1 to M9 and S4 (agent mode keeps us in the main category).

---

## Definition of done for the submission

- A new user with only MetaMask completes onboarding and a first EVM transaction on Diana testnet in under 60 seconds, recorded on video.
- An attack transaction through the MetaMask key is rejected by the chain, with the error code shown in the UI.
- The Q-Day kill switch revokes all classical keys in one root-key transaction.
- An AI agent key executes one capped action and is refused when it exceeds its cap.
- The demo dApp integrates via `@qoreconnect/wagmi` in 5 to 10 lines.
- All tests pass in CI. The repo is public with Apache-2.0, README, `AI_USAGE.md`, and testnet addresses.
