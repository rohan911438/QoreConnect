# P08 — Signing preview and honesty labels

**Goal:** Before MetaMask opens, the user sees a readable, simulated, policy-checked preview of exactly what they are about to sign, with an honesty label. "Never sign blind."

**Depends on:** P07.

**Read first:** `idea/02-solution.md` (decision 3), `idea/04-positioning-and-language.md` (honesty labels), `architecture/06-security-threat-model.md` (T3–T5).

**Time box:** 4 hours.

---

## Prompt

> 1. `buildPreview(tx, state)` in `packages/core/src/preview/`: decode calldata (ABI from the dApp config if provided; otherwise 4byte signature lookup with an offline fallback list; otherwise "unknown function" with raw selector); format value in QOR; run `eth_call` simulation from the root's 0x address and report success / revert reason; compute the policy check against the session rule (per-tx limit, remaining daily allowance if available, allow-list membership) and predict a chain refusal **before** signing; attach the label (`Classical, capped` / `Blocked by chain` / `Agent, capped`).
> 2. **Digest binding:** the object rendered in the preview is the same object passed to the digest builder. Add a unit test that changing any field after preview changes the digest.
> 3. **UI** in `packages/react`: `SigningPreview` modal component (accessible, keyboard-friendly, dark/light), showing contract (with explorer link), function and arguments, value, simulation result, policy check rows with ✓/✗, honesty label, and "Confirm in MetaMask" / "Cancel". Copy follows `idea/04-positioning-and-language.md`.
> 4. Wire it into the provider's preview hook when `@qoreconnect/react`'s `QoreConnectProvider` is used.
> 5. Tests: decoding (known ABI, 4byte fallback, unknown); policy prediction (within limit, over limit, not in allow-list); digest binding.

---

## Deliverables

- `buildPreview`, `SigningPreview` component, provider integration
- Tests

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | Unit tests | Pass |
| G2 | Prediction accuracy | For the P06 over-limit and not-allowed cases, the preview predicts "Blocked by chain" before signing |
| G3 | Manual | Preview appears before MetaMask in the demo dApp; Cancel aborts with EIP-1193 error 4001 |
| G4 | Accessibility | Modal is focus-trapped, labelled, and usable by keyboard (manual) |

## Failure branch

- 4byte lookup unreachable: ship the offline fallback list only.
- Remaining daily allowance not exposed by the chain: show the daily limit and "spent today (tracked by QoreConnect)" from relayer records, labelled as an estimate.
