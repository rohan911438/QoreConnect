# 03 — Flows

Each flow lists who signs what, and which assumptions are verified in prompt P01 (marked **[P01]**).

---

## Flow A: First-time onboarding (target: under 60 seconds)

```mermaid
sequenceDiagram
  actor U as User
  participant D as dApp + connector
  participant V as Root vault (browser)
  participant M as MetaMask
  participant S as Sponsor
  participant C as QoreChain

  U->>D: Click "Connect with MetaMask"
  D->>M: eth_requestAccounts
  M-->>D: 0xMetaMask
  D->>C: Is 0xMetaMask linked to any QoreConnect root? (local cache + REST)
  C-->>D: No
  D->>U: One screen: "We'll give your account a quantum-safe key"
  U->>V: Passkey tap (WebAuthn with PRF)
  V->>V: Generate seed, derive qor1 root + ML-DSA-87 key, encrypt seed with PRF key
  V->>S: Request sponsorship for root account
  S->>C: Fund root with minimum fee balance [P01]
  V->>C: Register ML-DSA-87 key (classical-signed, first tx) [P01: fee paid via funded balance]
  D->>M: personal_sign(possession proof text)
  M-->>D: 65-byte proof
  V->>C: Hybrid tx: linkAuthenticatorMsgs(MetaMask, ["evm"], expiry 7d, rule: caps + allow-list = this dApp)
  C-->>D: Linked
  D->>U: "You're on QoreChain" (timer stops)
```

**Sponsorship design.** The simplest reliable approach is that the sponsor sends a small amount of QOR to the new root account (enough for registration and linking fees), and the root account pays its own fees. Fee grants (`feegrant` module) would be cleaner if available. **[P01]** confirms which works.

**Abuse protection.** One sponsorship per MetaMask address and per browser, rate-limited per IP, with a global daily budget. A sponsored balance is small (fees only), so abuse costs little.

---

## Flow B: Everyday transaction

```mermaid
sequenceDiagram
  actor U as User
  participant D as dApp + connector
  participant P as Signing preview
  participant M as MetaMask
  participant R as Relayer
  participant C as QoreChain

  D->>D: writeContract(...) → eth_sendTransaction {to, data, value}
  D->>C: eth_call simulation + estimate gas
  D->>C: fetchAuthNonce(root, 0xMetaMask)
  D->>P: Show decoded call, value, simulation result, policy check, label "Classical, capped"
  U->>P: Confirm
  P->>M: buildMetaMaskExecuteEvm → personal_sign(digest v2)
  M-->>P: signature
  P->>R: POST /relay {msg, gasTankId}
  R->>R: Validate tank policy, rate limit, nonce freshness
  R->>C: Hybrid-signed envelope (relayer pays fee)
  C->>C: Check signature, nonce, expiry, permissions, rule caps, allow-list
  C-->>R: Result (check success flag, not only code 0)
  R-->>D: EVM tx hash or typed error
  D->>U: Confirmed (explorer link) or "Blocked by chain: …"
```

**Assumptions [P01]:**
1. `buildMetaMaskExecuteEvm` (or an underlying builder) accepts **calldata** (`data`), not only `to` and `value`.
2. Whether an open EVM window on the root account is required for authenticator `MsgExecuteEVM`.
3. The returned result exposes the inner EVM transaction hash.

**If a window is required (assumption 2 is true):** the root opens a **scoped window** at link time (bounds: at most 17,280 blocks, which is about 11 hours at the measured 2.33 s block time, so renewal is needed at least twice a day; transaction count; total uqor ≤ daily cap plus fees; `allowed_targets` = allow-list if supported). The dashboard renews it with a passkey tap. This also satisfies category requirement R1.

---

## Flow C: Approve a new dApp

```mermaid
sequenceDiagram
  actor U as User
  participant D2 as Second dApp
  participant V as Root vault
  participant C as QoreChain

  D2->>C: Connected address 0xMetaMask is linked, but contract 0xNew is not in allow-list
  D2->>U: "Approve <dApp name> to use your account? Contracts: 0xNew. Limits unchanged."
  U->>V: Passkey tap
  V->>C: fetchSpendingRules(root)
  V->>V: Merge: add 0xNew to allowed_evm_calls (keep all other rules intact)
  V->>C: Hybrid tx: updateSpendingRules(full rule set)
  C-->>D2: Approved
```

**Where does the dApp's contract list come from?** The connector is configured by the dApp with `contracts: [...]`, and the approval sheet shows them. A malicious dApp could list a drainer contract, so the sheet shows the addresses clearly, and caps still apply.

---

## Flow D: Revoke one key / Q-Day kill switch

```mermaid
sequenceDiagram
  actor U as User
  participant W as Dashboard
  participant V as Root vault
  participant C as QoreChain

  U->>W: "Quantum emergency: revoke all classical keys"
  W->>C: fetchAuthenticators(root)
  W->>U: Confirm list (MetaMask, 2 agent keys)
  U->>V: Passkey tap
  V->>C: One hybrid tx: revokeAuthenticator × N (+ close EVM windows)
  C-->>W: All revoked
  W->>U: "Only your quantum-safe root key can act now"
```

---

## Flow E: AI agent key (agent mode)

```mermaid
sequenceDiagram
  actor O as Owner
  participant W as Dashboard
  participant V as Root vault
  participant A as AI agent
  participant R as Relayer
  participant C as QoreChain

  O->>W: "New agent: pay invoices on 0xPayGate, max 2 QOR/day, 24h"
  W->>A: Request agent public address
  A-->>W: 0xAgent
  O->>V: Passkey tap
  V->>C: Hybrid tx: link 0xAgent ["evm"], expiry 24h, rule: 0.5/tx, 2/day, allowed_evm_calls 0xPayGate/0xSELECTOR
  O->>V: Sign instruction with root key (QoreSign message signing): {task, limits, nonce, expiry}
  V-->>A: Signed instruction
  A->>A: Verify instruction signature against root's registered key; reject unsigned / tampered
  A->>A: Plan action (Claude, tool use)
  A->>R: EIP-191-signed MsgExecuteEVM
  R->>C: Envelope
  C-->>A: Executed, or refused (code 5 / 10) if outside limits
```

**Authenticated messaging, two layers:**
1. **Owner → agent:** the agent acts only on instructions signed by the root key. Text found on a web page or in a tool result cannot become an instruction.
2. **Agent → chain:** every action is EIP-191-signed by the agent key with a per-key nonce; the chain enforces caps and allow-list regardless of what the model decides.

---

## Flow F: Recovery and "Move to QoreX"

1. **Recovery code export:** after a balance threshold or on request, the vault decrypts the seed (passkey tap) and shows it once as a recovery code, with a confirmation quiz.
2. **New device:** enter the recovery code; the vault re-derives the root key and re-encrypts it with the new device's passkey.
3. **Move to QoreX** *(only if [P01] confirms QoreX imports the seed)*: guided steps to import the seed into QoreX, then optional local wipe.

---

## Flow G: Doctor

Input: any `0x` or `qor1` address. Output: the first failing condition and a one-click fix.

| Check | Source | Fix |
|---|---|---|
| ML-DSA key registered and `possessionProven` | `pqcKeyStatus` precompile (`0x...0a02`) or REST | Onboard (Flow A) |
| EVM window open, with remaining tx count and budget | REST | Open or renew window |
| Authenticator linked, not expired | `fetchAuthenticators` | Link or renew |
| Enabled rule bounding every denom | `fetchSpendingRules` | Set default rule |
| Target contract in allow-list | Rule + provided target | Approve dApp (Flow C) |
| Relayer tank has budget | Relayer API | Contact dApp |

---

## Flow H: Migration Meter indexing

A small indexer (inside `apps/relayer` or a cron in `apps/web`) periodically:
1. Counts QoreConnect-onboarded accounts (from the relayer database and on-chain links).
2. Counts relayed `MsgExecuteEVM` executions and their value.
3. Samples recent EVM-lane activity on Diana and classifies the sender: has a registered ML-DSA key (post-quantum rooted) vs. not. **[P12 defines the exact query; testnet history is pruned, so we keep our own time series from the day we start.]**
4. Stores a time series; the public page renders it with links to the REST endpoints and explorer for every number.
