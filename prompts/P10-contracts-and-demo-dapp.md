# P10 — Contracts, demo dApp and attack demo

**Goal:** A small but real demo dApp integrated with `@qoreconnect/wagmi`, Foundry-tested contracts, and a reproducible attack scenario the chain refuses.

**Depends on:** P07, P09.

**Read first:** `idea/02-solution.md` (demo video plan), `architecture/06-security-threat-model.md`.

**Time box:** 1 day.

---

## Prompt

> 1. **Contracts** in `contracts/src/` (Foundry, Solidity ^0.8.24):
>    - `QoreTipJar` (or similar small, believable app): `tip(address creator, string note)` payable, per-creator balances, `withdraw()`; events. Chosen so the demo shows value moving within limits.
>    - `Drainer`: a contract that tries to pull the maximum value from the caller (`drain()` payable, forwards to an attacker address), used for the attack demo. Never approved.
>    - Optional (needed if the category falls back to Post-Quantum dApp): `QoreConnectGuard` using `pqcKeyStatus` (`0x0000000000000000000000000000000000000a02`, check `possessionProven`) and `pqcVerify` (`0x0000000000000000000000000000000000000a01`) to require a root ML-DSA-87 signature for large withdrawals. Precompile addresses lowercase.
> 2. **Foundry tests:** unit and fuzz tests for `QoreTipJar`; tests for `Drainer` behaviour; mock precompiles for `QoreConnectGuard`. `forge coverage` report.
> 3. **Deploy** to Diana with a script (`forge script` or viem), operator key with an open window (10-second wait after opening). Record addresses in `STATUS.md` and `docs/testnet-evidence.md`.
> 4. **Demo dApp** `apps/demo-dapp`: a polished "Quantum Tip Jar" UI using wagmi hooks only, with `qoreConnect({ contracts: [QoreTipJar] })`. Keep QoreConnect code to the connector config (≤ 10 lines).
> 5. **Attack scenario** (`apps/demo-dapp/attack` page, clearly labelled as a demo): a fake "claim airdrop" button that calls `Drainer.drain()` with a large value. Expected: preview shows "Blocked by chain"; if the user forces it, the chain refuses (code 10 or 5) and the UI shows the refusal with the tx hash.
> 6. **Script** `pnpm demo:attack` that reproduces the attack headlessly and prints the chain's refusal, for evidence.

---

## Deliverables

- Contracts, tests, coverage
- Deployed addresses
- Demo dApp and attack page
- `docs/testnet-evidence.md` started

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | `pnpm test:contracts` | All Foundry tests pass; coverage ≥ 90% for `QoreTipJar` |
| G2 | Deployed | Contracts on Diana; addresses verified via `eth_getCode` |
| G3 | Demo dApp manual | Tip within limits succeeds through MetaMask + relayer |
| G4 | Attack | `pnpm demo:attack` shows the chain refusal and tx hash |
| G5 | Integration size | Demo dApp's QoreConnect-specific code ≤ 10 lines |

## Failure branch

- Deploy fails because of window timing: wait longer after opening; re-check window bounds.
- Attack not refused as expected: stop and re-check rules with the P05 invariant checker; the security story depends on this.
