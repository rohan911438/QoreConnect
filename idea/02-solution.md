# 02 — The solution: QoreConnect

## One sentence

**QoreConnect gives every Ethereum user a hidden post-quantum root key, and turns their MetaMask key into a capped, scoped, revocable session key**, so they can use any QoreChain EVM dApp with the wallet they already have.

Tagline: **Quantum-safe root. MetaMask convenience.**

---

## The core insight: the security model

Today, people think the choice is:

- **Convenient but classical:** use MetaMask, and a quantum computer can steal everything.
- **Quantum-safe but inconvenient:** switch to QoreX and do the homework.

QoreConnect removes that choice by splitting authority between two keys:

| Key | Type | Where it lives | What it can do | How often it is used |
|---|---|---|---|---|
| **Root key** | ML-DSA-87 + secp256k1 hybrid (post-quantum) | User's browser, encrypted and unlocked by a passkey; backed up by a recovery code | Everything: link and revoke keys, set limits, approve dApps, move funds | Rarely: onboarding, approving a new dApp, changing limits, emergencies |
| **Session key** | The user's MetaMask key (classical secp256k1) | MetaMask, as today | Only what the root key allowed: approved dApp contracts, under a per-transaction and daily cap, until expiry | Every day |

**If a quantum computer breaks the MetaMask key**, the attacker can take at most one day's cap, only through approved contracts, until the root key revokes it. Without QoreConnect, a broken MetaMask key means everything is gone.

This is not a workaround. It is the correct security model for a post-quantum chain during the migration years: **the post-quantum key holds authority, the classical key holds convenience.**

---

## What the user experiences

### First visit (target: under 60 seconds)
1. User opens a dApp that integrated QoreConnect and clicks **"Connect with MetaMask"**.
2. MetaMask connects as usual.
3. QoreConnect shows a one-screen explanation: *"We'll give your account a quantum-safe key. You'll keep using MetaMask."*
4. User taps their **passkey** (fingerprint or Face ID). In the background:
   - A seed phrase is generated in the browser.
   - The QoreChain account and its ML-DSA-87 key are derived with the official SDK (the same derivation QoreX uses).
   - The seed is encrypted with a key unlocked by the passkey and stored locally.
   - The sponsor pays the fee to register the post-quantum key.
5. User signs **one MetaMask message**: the proof that they own the MetaMask address (needed to link it).
6. The root key links the MetaMask address as a session key with **safe defaults**: only this dApp's contracts, 5 QOR per day, 1 QOR per transaction, 7-day expiry.
7. Done. The user is on QoreChain.

### Every day after
- The user uses the dApp normally. When the dApp sends a transaction, QoreConnect shows a **readable preview** (contract, function, amount, test-run result, "within your daily limit"), then MetaMask asks for one signature.
- The relayer submits it and the dApp's gas tank pays the fee. The user needs no QOR for gas.

### When they open a second dApp
- One passkey tap approves the new dApp's contracts. Nothing else to do.

### When something goes wrong
- **Lost or compromised MetaMask:** one passkey tap revokes it. Funds stay with the root key.
- **"Quantum emergency":** one passkey tap revokes **every** classical key on the account at once.
- **New device:** restore the root key from the recovery code, or move it into QoreX.

### When they are ready to go further
- **"Move to QoreX":** the root key is a standard QoreChain account, so it can be imported into QoreX *(unverified, checked in P01)*. QoreConnect brings Ethereum users in; QoreX is where they settle.

---

## What the developer experiences

```ts
import { qoreConnect } from '@qoreconnect/wagmi'

const config = createConfig({
  chains: [qorechainTestnet],
  connectors: [qoreConnect({ relayerUrl: 'https://relay.qoreconnect.xyz', gasTankId: 'my-dapp' })],
  transports: { [qorechainTestnet.id]: http() },
})
```

- **No contract changes.** Existing `writeContract` and `sendTransaction` calls go through QoreConnect automatically.
- **Shows up in wallet pickers.** The connector announces itself via EIP-6963, so RainbowKit and ConnectKit list it.
- **Gas tank.** The dApp funds a gas budget; its users pay no gas.
- **Self-hostable relayer.** One Docker command if a team wants its own.
- **Doctor.** A call that answers "why will this account's next transaction fail?" with a fix.

---

## The five design decisions that make it deep, not surface-level

### 1. The root key is a normal QoreChain account, not a lock-in
- Standard BIP-39 seed, standard SDK derivation (`derivePqcCanonical`), so it is compatible with QoreX and the qorechaind CLI.
- **Progressive security:** the user starts with just a passkey. When the balance passes a threshold, QoreConnect asks for a recovery-code backup or a move to QoreX.
- **Why it matters for QoreChain:** we feed users into QoreX instead of competing with it.

### 2. Per-dApp scoping instead of a blanket key
- A session key that can call any contract is dangerous. QoreConnect writes the **approved dApp's contract addresses** into the on-chain allow-list (`allowed_evm_calls` in the spending rule).
- Approving a new dApp is one passkey tap, which re-writes the rule with the new contract added.
- The dashboard lists every approved dApp with one-tap removal.
- Caps (per transaction, daily) also bound plain value transfers, which an allow-list alone does not stop.

### 3. "Never sign blind"
- The chain requires MetaMask to sign a raw EIP-191 digest, so MetaMask would show the user an unreadable hex string. That is how phishing works.
- QoreConnect shows a **readable preview before MetaMask opens**: decoded contract call, value, `eth_call` simulation result, and the policy check against the user's limits.
- Every action carries an **honesty label**: *"classical, capped"* for MetaMask-signed actions; *"quantum-safe"* for root-key actions. This mirrors QoreX's "Honesty built in".

### 4. dApp-funded gas tanks
- Each dApp funds a gas tank; the relayer draws from it, with per-user daily limits and spam protection.
- This is the paymaster model Ethereum has (Biconomy, Pimlico), which QoreChain does not have yet. QoreChain's roadmap lists gas abstraction only as a 2027 target.

### 5. The Q-Day kill switch
- One passkey tap revokes every classical key on the account.
- Only a chain with a post-quantum root can offer this. It is the central moment of the demo video.

---

## The Migration Meter (public dashboard)

A public, live page that shows QoreChain's progress towards the 2027 "Required" flip:

- **Share of QoreChain EVM activity** sent through a post-quantum-rooted account (QoreConnect or otherwise) versus plain classical keys. Exact data source is defined in P12.
- **Accounts migrated**, **dApps integrated**, **value protected by a post-quantum root**.
- **Countdown** to the Q3 2027 Required flip.
- Every number links to the explorer or the REST endpoint it came from, in line with QoreChain's *"a number that can be checked is a fact"*.

It turns QoreConnect into the progress tracker for QoreChain's own goal: an early version of the "public countdown and dashboard" QoreChain has committed to for 2027.

---

## The AI-agent mode (small, on purpose)

An AI agent is just another session key. From the same dashboard the owner can issue a key to a bot or AI agent with:
- A contract allow-list
- Per-transaction and daily caps
- An expiry
- Instructions from the owner signed with the root key (authenticated messaging), so a prompt-injected page cannot command the agent.

The agent signs with its own secp256k1 key through the same relayer. This keeps us inside the Post-Quantum AI Agents category and eligible for Best AI-Native Build, without turning the product into a chat wallet.

---

## What the demo video shows (3 minutes)

1. **0:00–0:20.** The problem, timed: a MetaMask user tries a QoreChain dApp and fails. On screen: "12 steps, 15+ minutes".
2. **0:20–1:00.** The same user with QoreConnect: passkey tap, one MetaMask signature, first transaction confirmed. Timer stops under 60 seconds.
3. **1:00–1:30.** Readable preview, honesty label, gas paid by the dApp's tank.
4. **1:30–2:00.** Attack: a malicious contract tries to drain the account through the MetaMask key. The chain rejects it with "spending limit exceeded" / "permission denied".
5. **2:00–2:20.** Q-Day kill switch: one tap, all classical keys revoked.
6. **2:20–2:40.** Developer view: 5-line wagmi integration, plus other fest projects already using it.
7. **2:40–3:00.** Migration Meter and the 2027 alignment.
