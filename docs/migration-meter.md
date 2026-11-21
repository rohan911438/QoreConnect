# Migration Meter: how we count

The Migration Meter shows how much of QoreChain's EVM activity is already rooted in post-quantum keys, and what
QoreConnect contributes. **A number that can be checked is a fact**: every number on `/meter` links to the raw rows
behind it (`GET /v1/meter/evidence/<metric>` on the relayer), and every row links to the chain (REST or explorer).

Scope: **QoreChain Diana testnet** (chain `qorechain-diana`, EVM 9800). Abstract accounts are testnet-only; nothing
here describes mainnet.

## Refresh and storage

- The relayer's indexer computes a snapshot every `METER_INTERVAL_MS` (default 15 minutes) and stores it in
  `meter_snapshots` (SQLite). `GET /v1/meter` returns the latest snapshot; `GET /v1/meter/series` returns the stored
  history (one point per snapshot, at most 2,000 points).
- **Known limitation:** Diana's history is pruned, so we cannot reconstruct the past. The series starts on the day
  the indexer first ran and only grows from there. Gaps mean the indexer was not running.

## Metrics

### 1. Accounts onboarded through QoreConnect
- **Definition:** distinct root accounts the QoreConnect sponsor funded, whose ML-DSA-87 key is now registered.
- **Source:** relayer table `sponsorships` (status `funded`). Registration confirmed per account via REST
  `/qorechain/pqc/v1/account/{address}` (sampled up to 200 accounts per snapshot).
- **Evidence:** `GET /v1/meter/evidence/onboarded` lists each account, its sponsor tx and a REST link.
- **Limitation:** accounts onboarded without our sponsor (already funded) are not counted.

### 2. Classical keys under a post-quantum root
- **Definition:** active (not revoked, not expired) linked authenticator keys on accounts known to QoreConnect
  (sponsored roots plus accounts that relayed at least once), split into MetaMask session keys and agent keys
  (label `agent:*`).
- **Source:** REST `/qorechain/abstractaccount/v1/authenticators/{address}` per account (up to 200 per snapshot).
- **Evidence:** `GET /v1/meter/evidence/keys`.
- **Why it matters:** each of these keys can be revoked in one transaction by a quantum-safe root (the Q-Day kill
  switch). That is the migration path: classical convenience today, post-quantum control throughout.

### 3. Relayed executions and chain refusals
- **Definition:** `MsgExecuteEVM` calls the QoreConnect relayer broadcast: successful executions (count and QOR
  value moved), and executions the **chain** refused, grouped by refusal code (5 = limit exceeded, 10 = not
  approved / not permitted, 6 = expired, 11 = nonce). Calls the relayer refused before broadcasting (no fee spent)
  are counted separately as "pre-rejected".
- **Source:** relayer table `relays` (`success`, `code`, `tx_hash`, `value_uqor`).
- **Evidence:** `GET /v1/meter/evidence/relays` lists the most recent 200 with explorer links.

### 4. EVM-lane senders with and without a post-quantum key (sample)
- **Definition:** among distinct `from` addresses of EVM transactions in the most recent `METER_SAMPLE_BLOCKS`
  blocks (default 200, at most 50 senders), the share whose account has a registered ML-DSA key.
- **Source:** EVM JSON-RPC `eth_getBlockByNumber` (full transactions); each sender checked with the
  `pqcKeyStatus` precompile (`0x0000000000000000000000000000000000000a02`) via `eth_call`.
- **Evidence:** `GET /v1/meter/evidence/senders` lists the block range, each sender and its result.
- **Limitation:** **it is a sample**, labelled with its size and block range. Relayed QoreConnect calls run inside
  Cosmos envelopes and do not appear as EVM transactions, so they are not in this sample (they are counted in
  metric 3).

### 5. dApps integrated
- **Definition:** distinct gas tanks with at least one successful relayed execution.
- **Source:** relayer tables `tanks` and `relays`. **Evidence:** `GET /v1/meter/evidence/dapps`.

### 6. Countdown to Q3 2027
- **Definition:** days until 1 July 2027, the start of Q3 2027, when QoreChain's roadmap targets making hybrid
  signatures "Required" on the EVM lane (once a supermajority of EVM traffic signs hybrid).
- **Source:** QoreChain's published roadmap. **This is QoreChain's target, not a QoreConnect promise.**

## What we do not claim

- We do not claim MetaMask keys are quantum-safe. They are classical keys, capped and revocable by a quantum-safe root.
- We do not estimate mainnet numbers.
