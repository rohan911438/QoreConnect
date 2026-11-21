# 01 — The problem

## One sentence

**QoreChain's EVM is unreachable for Ethereum users**: every EVM transaction needs a post-quantum key that their wallet cannot hold, and the only wallet that can hold it (QoreX) refuses EVM signing.

---

## The root cause

QoreChain's security rule is that **every account must be controlled by a post-quantum key**. On the EVM lane this is enforced at the protocol level:

1. **Registered ML-DSA-87 key.** An EVM transaction is accepted only from an account that has registered a 2,592-byte ML-DSA-87 public key. Registration costs about 600k gas, and it is the only classical-signed transaction the chain accepts from that account.
2. **Open EVM window.** The account must also have an open "EVM authorisation window" (`MsgOpenEVMWindow`), opened from the native lane. A window is bounded by 1 to 17,280 blocks, 1 to 1,000 transactions, and a total uqor amount covering value plus fees.
3. **Hybrid signing on the native lane.** Every native-lane transaction (including opening the window) must carry both a secp256k1 signature and an ML-DSA-87 signature.

The question is not "how do we connect MetaMask?". The real question is:

> **How does an ordinary person get a post-quantum root key without knowing it exists, while keeping the wallet they already use?**

Nobody in the ecosystem has answered it. QoreX's answer is "switch wallets", which most Ethereum users will not do.

---

## The five symptoms

### Symptom 1: MetaMask users cannot send a single transaction
MetaMask cannot hold an ML-DSA-87 key and cannot open an EVM window. A MetaMask-only user who adds chain 9800 and presses "send" gets a rejected transaction. *(Source: QoreChain docs, EVM window reference and FAQ.)*

### Symptom 2: QoreX refuses EVM signing
QoreX supports connecting, reading accounts and `signAndBroadcast` for native QoreChain messages. It refuses `personal_sign`, `eth_sendTransaction` and `eth_signTypedData_v4` with "not yet supported", and it does not emit `accountsChanged` or `chainChanged`. *(Source: docs, QoreX integrations page.)* So even users who install QoreChain's own wallet cannot use a standard Ethereum dApp.

### Symptom 3: Onboarding takes about 12 steps
For a new user to make a first EVM transaction today:

1. Install QoreX (extension or mobile)
2. Create a wallet and back up the seed
3. Switch QoreX to Testnet
4. Find the faucet
5. Claim test QOR
6. Register the ML-DSA-87 key (about 600k gas)
7. Wait for confirmation
8. Learn what an EVM window is
9. Open a window with the right bounds
10. Wait about 10 seconds (documented gotcha)
11. Find a dApp that supports QoreX
12. Discover QoreX cannot sign the EVM transaction anyway

Most users give up before step 6.

### Symptom 4: Every dApp team rebuilds the same plumbing
From the 112 projects submitted so far:
- **Fenestella, Leash, Steward and LEASH** each wrote their own relayer for authenticator transactions.
- **T-REX ID** wrote its own server-side JSON-RPC proxy.
- **Qore PQ Health and qorechain-pq-check** each wrote their own "why will my next transaction fail" checker.

That is at least 7 teams solving the same problem separately, inside one hackathon. Nobody is building the shared layer.

### Symptom 5: The standard Ethereum toolchain breaks
- The public REST API sends no CORS headers, so browser apps need a proxy.
- The `qor_` JSON-RPC namespace is not served publicly.
- The explorer has no contract verification and no Etherscan-compatible API.
- Precompiles return empty data (no revert) on mainnet, which fails silently.

---

## Why this is QoreChain's most important problem

### It blocks QoreChain's own 2027 plan
QoreChain's roadmap:

> **2027: "The migration year."** Committed: an "EVM migration window, with public countdown and dashboard".
>
> **Q3 2027:** the EVM lane flips to **"Required"**, *conditional on a supermajority of EVM traffic already signing hybrid*.
>
> **2030: "The deadline year."**

The flip to Required **cannot happen** until most EVM traffic is already post-quantum protected. Today that share is close to zero, because the users who would make up that traffic cannot onboard. The problem is not a UX inconvenience. **It is the gating condition of QoreChain's own roadmap.**

### It blocks QoreChain's main growth channel
QoreChain's homepage promise is *"Build with the Ethereum, Cosmos and Solana tools you already know."* The About page names *"the fragmentation of development across incompatible ecosystems"* as one of its two existential challenges. Ethereum is the largest pool of users and developers QoreChain can attract. Right now the door is effectively closed.

### It undermines QoreX's promise
QoreX's brand is *"Crypto without the homework"*. The current EVM onboarding is mostly homework.

---

## Who feels the pain

| Who | Pain today | What they need |
|---|---|---|
| **Ethereum users** | Cannot transact on QoreChain EVM with MetaMask | Keep MetaMask, get quantum-safe protection without learning anything |
| **dApp developers** | Must build key registration, window management and a relayer before shipping their actual product | A drop-in connector that works with wagmi and viem |
| **Hackathon teams (right now)** | Same as developers, under an 11-day deadline | An SDK they can add in an afternoon |
| **QoreChain** | Cannot reach the "supermajority hybrid" condition for the 2027 flip | A migration path for EVM users, plus a public metric of progress |
| **Security-minded users** | A classical key holds everything; a broken key means total loss | A post-quantum root that caps and revokes the classical key |

---

## What already exists, and why it is not enough

| Existing piece | What it does | What is missing |
|---|---|---|
| `x/abstractaccount` authenticators | Lets an owner link an external key (MetaMask address, ed25519) with permissions, expiry and spending rules | Only exposed as low-level SDK helpers; no onboarding, no product, no relayer, testnet-only |
| `buildMetaMaskExecuteEvm` (SDK 0.14.0) | Asks MetaMask to sign an EIP-191 authorisation that a relayer can submit | No relayer exists for public use; the user still needs an owner account with a post-quantum key |
| QoreX | Post-quantum wallet with good UX | Refuses EVM signing; requires switching wallets |
| Zeni Wallet (fest project) | Its own post-quantum smart wallet and connector | A new wallet, not MetaMask onboarding |
| Qore PQ Health, qorechain-pq-check (fest projects) | Diagnose why the next EVM transaction fails, and guide repair | Diagnosis only; the user still needs QoreX and the 12 steps |
| Agent relayers (Fenestella, Leash, Steward) | Relay transactions for AI agents with limited keys | Built for one agent each, not for ordinary users or other dApps |

**The gap:** sponsored first-time onboarding for MetaMask users, plus a shared relayer and connector that every dApp can use. The docs themselves leave this open.

---

## Sources

- docs.qorechain.io: SDK authenticators guide, account abstraction guide, QoreX integrations, EVM precompiles, cross-VM reference, workshops 2 and 3
- build.qorechain.io: rules, prizes, FAQ, kits, projects (112 listed, 16 read in detail)
- qorechain.io: home, about, roadmap, QoreX, tokenomics, ecosystem

Research date: 21 Nov 2026. Status of on-chain features is as stated in the docs (checked 27 Oct to 18 Nov 2026) and must be re-verified in prompt P01.
