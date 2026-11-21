# 04 — Relayer and sponsor

## Purpose

1. **Relay:** accept MetaMask-signed (or agent-signed) `MsgExecuteEVM` messages, wrap them in a hybrid-signed transaction from the relayer account, pay the fee, and report the real outcome.
2. **Sponsor:** fund new root accounts with just enough QOR for their first transactions.
3. **Gas tanks:** account for fees per dApp with budgets and limits.
4. **Meter:** keep the Migration Meter time series.

The relayer is **trusted for liveness only**. It cannot alter signed content and cannot exceed on-chain rules.

## API

| Method | Path | Body / query | Response |
|---|---|---|---|
| `POST` | `/v1/relay` | `{ msg: <MsgExecuteEVM JSON>, gasLimit, gasTankId }` | `{ txHash, evmTxHash, success, code, error? }` |
| `GET` | `/v1/relay/:txHash` | | Status of a submitted relay |
| `POST` | `/v1/sponsor` | `{ rootAddress, metamaskAddress, proof }` | `{ funded: true, amount, txHash }` |
| `GET` | `/v1/tanks/:id` | | `{ balance, dailySpent, perUserDailyCap }` |
| `POST` | `/v1/tanks` | `{ name, owner, perUserDailyCap }` (admin key) | Tank created |
| `GET` | `/v1/doctor/:address` | `?target=0x...` | Ordered list of checks with status and fix |
| `GET` | `/v1/meter` | | Current Migration Meter numbers with source links |
| `GET` | `/v1/meter/series` | `?from=&to=` | Time series |
| `GET` | `/health` | | Relayer and sponsor balances, chain height, version |

All responses are JSON. Errors use the chain's codes where possible (see `02-account-model.md`).

## Relay pipeline

> **P01 findings that shape this pipeline:**
> 1. A refused execution is still a code-0 transaction **with a fee paid by the relayer** (0.0975 QOR measured). So step 4 (local pre-check of allow-list, caps, expiry, nonce, plus `eth_call` simulation) is **mandatory**, not optional.
> 2. The envelope's gas must cover the signed `gasLimit`, or the chain refuses with code 10 ("provisions X gas for the call, less than the signed gas_limit"). Use `gas = max(simulated × 1.3, signedGasLimit + 450,000)`.
> 3. Measured relay cost: 0.066–0.081 QOR per execution at 0.15 uqor/gas.

1. **Parse and validate** the message shape (zod schema). Reject anything other than `MsgExecuteEVM` (and later `MsgExecuteCosmos` if C2 is built).
2. **Tank policy:** tank exists, has budget; per-user daily cap not exceeded; rate limit per user and per IP.
3. **Freshness:** `fetchAuthNonce` for (account, pubkey) equals the message nonce; otherwise return code 11 early, without spending gas.
4. **Pre-check (cheap):** authenticator linked and not expired; enabled rule exists. Optional, for better error messages.
5. **Build envelope:** relayer account signs a hybrid transaction containing the message, with the exact `gasLimit` the user signed (digest v2), and fee = `gasLimit × 0.1 uqor` minimum (fee floor per docs).
6. **Broadcast** via REST/RPC; wait for inclusion.
7. **Verify outcome:** use `assertAuthenticatorExecutionsSucceeded` / `decodeAuthenticatorExecutions`. Code 0 with `success=false` is a failure. Extract the inner EVM transaction hash.
8. **Account:** deduct the fee from the tank; increment counters; write the meter event.
9. **Respond.**

## Concurrency

The relayer account has one sequence number. Use a **single-writer queue** per relayer account (or a pool of relayer accounts, each with its own queue) so envelopes never collide. For the hackathon: one account, one queue, retries on sequence mismatch.

## Sponsor policy

| Control | Default |
|---|---|
| Amount per new root | Enough for ML-DSA registration (~600k gas) + link + rules + one window, computed from the fee floor, plus 20% margin *(exact number computed in P01)* |
| Limit per MetaMask address | 1 sponsorship, ever |
| Limit per IP | 3 per day |
| Global daily budget | Configurable; default sized to the faucet top-up we can maintain |
| Proof required | MetaMask possession proof over the root address (prevents sponsoring random addresses) |

**Faucet constraint:** the testnet faucet gives one claim per account per 24 hours. We pre-fund several operator accounts during the build and consolidate into the sponsor and relayer accounts. Track balances on `/health` and alert when low.

## Gas tank model

```
tank {
  id: "demo-dapp",
  owner: "qor1…",          // who can top it up / change caps
  balanceUqor: 50_000_000,
  perUserDailyCapUqor: 2_000_000,
  allowedContracts?: ["0x…"],  // optional: tank only pays for calls to these
  paused: false
}
```

For the hackathon, tanks are funded off-chain by the operator (we track balances in the database). On-chain tank funding is a post-fest milestone.

## Storage

SQLite (via Drizzle) for the hackathon; Postgres-compatible schema for later. Tables: `tanks`, `relays`, `sponsorships`, `rate_limits`, `meter_events`, `meter_snapshots`.

## Secrets

- `RELAYER_MNEMONIC`, `SPONSOR_MNEMONIC`, `ADMIN_TOKEN` in environment variables only. Never in the repo.
- Separate accounts for relayer and sponsor so that a bug in one cannot drain the other.

## Deployment

- `apps/relayer` ships a `Dockerfile`; target a small container host (Fly.io, Railway, or Render) or Vercel Functions if the queue model fits.
- Health check on `/health`; uptime monitor during judging (6–15 Dec).
- Self-host: `docker run -e RELAYER_MNEMONIC=… ghcr.io/<org>/qoreconnect-relayer`.
