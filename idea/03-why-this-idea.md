# 03 — Why this idea

This document explains why QoreConnect is the strongest single project we can build for this fest, and why it is better for QoreChain than the alternatives we considered.

---

## 1. It solves the gating problem of QoreChain's own roadmap

QoreChain's roadmap says the EVM lane flips to **Required** in Q3 2027, **conditional on a supermajority of EVM traffic already signing hybrid**. That condition cannot be met while Ethereum users cannot onboard.

QoreConnect is a direct path to meeting it: every MetaMask user it onboards becomes an account rooted in a post-quantum key, and the Migration Meter measures the progress publicly. **We are building the missing piece of QoreChain's 2027 plan.** No other project on the board makes that claim.

## 2. It matches every pillar of QoreChain's positioning

| QoreChain says | Where it says it | QoreConnect delivers |
|---|---|---|
| "Build with the Ethereum, Cosmos and Solana tools you already know" | Homepage hero | MetaMask and wagmi work as-is |
| Fragmentation across ecosystems is an "existential challenge" | About page | Ethereum's wallet and tooling connect to QoreChain without rewrites |
| "Crypto without the homework" | QoreX page | Onboarding drops from about 12 steps to 2 actions |
| "Never sign blind" | QoreX page | Readable preview and simulation before MetaMask signs |
| "Honesty built in" (classical signatures labelled as classical) | QoreX page | "classical, capped" vs "quantum-safe" labels on every action |
| "No flag-days" | Roadmap | Users migrate gradually, starting today |
| "A number that can be checked is a fact" | Tokenomics and roadmap | Migration Meter with links to every source |
| "EVM migration window, with public countdown and dashboard" (2027 committed) | Roadmap | An early version of that dashboard |
| QoreX UX 2.0: gas abstraction, multi-device recovery (2027 target) | Roadmap | Gas tanks and passkey plus recovery code, working now |
| Third-party post-quantum wallets via QoreSign (ecosystem gap) | Ecosystem page and roadmap | QoreSign-style hybrid signing inside someone else's wallet flow |

## 3. It is infrastructure, not an app

Most fest projects are single apps: a vault, an escrow, an auction, an agent. Each one benefits one set of users.

QoreConnect is a **layer every EVM app can use**. Its value grows with each integration. That is what:
- **judges** rate highest on ecosystem impact,
- **the Association Grant** (up to $10,000 in QOR) is designed to fund,
- **People's Choice voters** reward, because every integrating team brings its community.

## 4. The competitive gap is real and verified

We read the 112-project list and 16 project pages in detail (21 Nov 2026):

| Crowded area | Count (approx.) |
|---|---|
| Spend-limited AI agents | 22 |
| Vaults | 9 |
| Escrows | 7 |
| Inheritance / dead-man switches | 7 |
| Sealed-bid auctions | 4 |
| Post-quantum checkers and certificates | 12 |

**Closest projects to ours, and how we differ:**

| Project | What it does | Difference |
|---|---|---|
| Zeni Wallet | Its own post-quantum smart wallet with a connector | Asks users to adopt a new wallet. We keep MetaMask. |
| Qore PQ Health | Diagnoses why the next EVM transaction fails, guides repair | Diagnosis plus QoreX homework. We remove the homework. Our Doctor is one feature, not the product. |
| qorechain-pq-check | CLI and contract that report the blocker | Developer diagnostic. We fix the blocker for end users. |
| Fenestella, Leash, Steward | Relayers and limited keys for AI agents | Built for one agent. We are a shared relayer and connector for every user and dApp. |
| AgentGuard PQ, AgentShield | Agent policy guards | Agent-only. Agent mode is one small feature of ours. |

**Nobody is doing sponsored first-time onboarding of MetaMask users with a shared relayer and a drop-in connector.** The docs themselves leave this gap open.

## 5. It uses the deepest set of QoreChain primitives correctly

| Primitive | How we use it |
|---|---|
| ML-DSA-87 key registration (`x/pqc`) | Sponsored registration of the user's root key |
| Hybrid signing (secp256k1 + ML-DSA-87) | Root key signs every account-management transaction |
| `x/abstractaccount` authenticators | MetaMask address linked as a session key with possession proof |
| Spending rules (`perTxLimit`, `dailyLimit`, `allowedDenoms`, `allowed_evm_calls`) | Caps and per-dApp contract allow-list |
| `MsgExecuteEVM` through a relayer | Every MetaMask-signed transaction |
| EVM windows (`MsgOpenEVMWindow`) with bounds | Scoped windows where the protocol needs them |
| `revokeAuthenticator` | Per-key revoke and the Q-Day kill switch |
| `pqcKeyStatus` precompile | Doctor and Migration Meter checks |
| QoreSign message signing | Root-key-signed instructions to agents (authenticated messaging) |
| `@qorechain/mcp` (optional) | Read-only chain data for the agent mode |

Judges from the QoreChain team will see that we understand how their chain actually works, including the gotchas (possession proof since v3.2.8, wholesale rule replacement, `success=false` with code 0, "no enabled rule means no limit").

## 6. It is honest about its limits, which QoreChain values

QoreChain's site repeatedly labels status (Shipped, In progress, Committed, Target, Exploring) and says "verify every figure". We follow the same discipline:
- We say "live on Diana testnet", because abstract accounts are off on mainnet.
- We never call the MetaMask key quantum-safe.
- We test our assumptions on testnet first (P01) and publish the results.

## 7. It produces a demo judges will remember

Two moments carry the video:
1. **The timer:** 15+ minutes of failure versus under 60 seconds with QoreConnect.
2. **The attack:** a drain attempt through the MetaMask key, rejected by the chain; then the Q-Day kill switch.

Both are visual, fast and specific to QoreChain.

## 8. It creates a lever no other entry has: other teams

If we publish the SDK by around 26 Nov and post "add MetaMask onboarding in 5 lines" in the fest Discord, other teams with EVM dApps have every reason to integrate: their own users hit the same wall. Even 3 to 5 integrations prove ecosystem value before judging starts.

---

## Ideas we considered and rejected

| Idea | Why we rejected it |
|---|---|
| **Three separate projects** (encrypted forms, cross-VM payment links, AI copilot) | Splits 11 days across three average entries; none would be showcase quality. |
| **Chat-based AI wallet copilot** | "Chat wallets are old" (user feedback). The AI-agent category already has about 22 spend-limited agents. Does not fix a QoreChain-specific problem. |
| **QorePay (cross-VM payment links)** | Least crowded category (5 entries), but the prize is not announced, only one approved Native target is known, and it serves a narrow use case. |
| **SealForm (encrypted forms)** | Good and unique, but a single app. Does not address QoreChain's growth or roadmap. |
| **Protocol Builders (rollup)** | Needs at least 2 people and deep rollup work; highest risk of not finishing. |

---

## The one-line case for the judges

> *QoreChain's EVM can only become quantum-safe by default once most EVM users already are. Today they cannot even get in. QoreConnect lets any MetaMask user and any EVM dApp onto QoreChain in under 60 seconds, with a post-quantum root key in control, and measures the migration in public.*
