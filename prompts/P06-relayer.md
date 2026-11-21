# P06 — Relayer service

**Goal:** A production-shaped relayer that accepts session-key-signed `MsgExecuteEVM`, submits it from a hybrid-signed relayer account, pays fees from a gas tank, and reports the true on-chain outcome.

**Depends on:** P05.

**Read first:** `architecture/04-relayer.md`, `architecture/06-security-threat-model.md` (T6–T9, T14), `spike/src/q01-calldata.ts`.

**Time box:** 6 hours.

---

## Prompt

> Implement the relayer in `packages/relayer` (library) and expose it in `apps/relayer` (Hono server).
>
> 1. Endpoints exactly as in `architecture/04-relayer.md`: `POST /v1/relay`, `GET /v1/relay/:txHash`, `GET/POST /v1/tanks`, `GET /health`. (Sponsor exists from P04; Doctor and Meter come in P12.)
> 2. Pipeline: zod validation (only `MsgExecuteEVM`) → tank policy (budget, per-user daily cap, optional contract filter, paused flag) → rate limits (per user and per IP) → nonce freshness via `fetchAuthNonce` (early code 11) → build the envelope with the exact signed `gasLimit` and fee ≥ `gasLimit × 0.1 uqor` → single-writer queue per relayer account → broadcast → wait for inclusion → verify with `assertAuthenticatorExecutionsSucceeded` → extract the inner EVM tx hash → debit tank → record the relay.
> 3. Map chain refusals to typed errors (`LIMIT_EXCEEDED` 5, `EXPIRED` 6, `NOT_APPROVED` 10, `NONCE` 11, `MODULE_DISABLED` 9).
> 4. Sequence handling: on sequence mismatch, refresh and retry once.
> 5. Storage: SQLite via Drizzle; migrations committed.
> 6. Config via env (`RELAYER_MNEMONIC`, `SPONSOR_MNEMONIC`, `ADMIN_TOKEN`, endpoints). Fail fast on startup if a secret is missing. `/health` shows relayer and sponsor balances (not secrets).
> 7. Tests: unit tests for policy, rate limits and error mapping (mock chain); integration test on Diana: relay a Counter `increment()` signed by a stand-in MetaMask key linked in P05; relay an over-limit call and get `LIMIT_EXCEEDED`; replay the same message and get `NONCE`.
> 8. `apps/relayer/Dockerfile` (Node 22 slim, non-root user) and a seed script to create the `demo-dapp` tank.

---

## Deliverables

- Relayer library and server
- Drizzle schema and migrations
- Dockerfile
- Tests

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | Unit tests | Pass |
| G2 | Integration: success | `POST /v1/relay` increments the Counter; response has `success: true` and an EVM tx hash visible on the explorer |
| G3 | Integration: over limit | Response `LIMIT_EXCEEDED` with chain code 5; tank not debited for a pre-rejected request, debited correctly for an on-chain refusal |
| G4 | Integration: replay | `NONCE` returned without broadcasting |
| G5 | Concurrency | 5 parallel relay requests all succeed (no sequence collisions) |
| G6 | Docker | `docker build` succeeds and `/health` responds inside the container (or documented if Docker is unavailable locally; then verified in P14) |

## Failure branch

- Inner EVM tx hash not available in the result: return the envelope tx hash and resolve the EVM hash via REST events; document.
- Concurrency failures: fall back to strict serial processing; it is enough for the hackathon.
