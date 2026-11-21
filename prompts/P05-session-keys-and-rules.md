# P05 — Session-key linking, spending rules and dApp approval

**Goal:** The root can link a MetaMask address as a capped, scoped, expiring session key in one transaction; approve additional dApps without losing existing rules; revoke one key or all classical keys.

**Depends on:** P04.

**Read first:** `architecture/02-account-model.md` (all rules), `architecture/03-flows.md` (Flows A, C, D), `spike/SDK_NOTES.md`, `spike/results/*.json` (rule JSON shape).

**Time box:** 5 hours.

---

## Prompt

> Implement in `packages/core/src/account/`:
>
> 1. `linkSessionKey({ root, metamask, contracts, limits, expiry })`: request the possession proof via `personal_sign` on the exact 5-line text (use `metaMaskPossessionProof`); read current rules; build `linkAuthenticatorMsgs` with permissions `["evm"]`, the expiry, and a merged rule set that binds an enabled rule (perTxLimit, dailyLimit, allowedDenoms, allowed_evm_calls = contracts) to this authenticator; if P01 showed an EVM window is required, include a scoped window in the same transaction. Sign with the root (hybrid) and broadcast.
> 2. `approveDapp({ root, contracts })`: read rules → add contracts to the session key's `allowed_evm_calls` → write the **full** rule set.
> 3. `setLimits({ root, key, perTx, daily, denoms })`: same read-merge-write.
> 4. `revokeKeys({ root, keys | 'all-classical' })`: one transaction with all `revokeAuthenticator` messages (pubkeys as bytes), plus closing EVM windows if any.
> 5. `getSessionState(root)`: linked keys with labels, expiry, rules, allow-list, today's spend if the chain exposes it.
> 6. **Invariant checker** `assertRuleInvariants(state)`: every value-moving key has an enabled rule bounding every denom; throws if not. Call it after every write in tests and in the SDK (dev mode).
> 7. Unit tests for the merge logic: adding a contract keeps all other rules; removing one dApp removes only its contracts; setting limits on one key does not touch the agent key's rule.
> 8. Integration tests on Diana: link → approve a second contract → set limits → revoke one → link two → revoke all. After each step, read state back and run the invariant checker. Record tx hashes.

---

## Deliverables

- `packages/core/src/account/*`
- Invariant checker
- Unit + integration tests

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | Unit tests for merge logic | Pass, including "no rule lost" cases |
| G2 | Integration: link | State shows authenticator with `["evm"]`, expiry, and an enabled rule with the allow-list |
| G3 | Integration: approve | Second contract added; first still present |
| G4 | Integration: revoke all | No classical authenticators remain |
| G5 | Invariants | Checker passes after every step |
| G6 | Evidence | Tx hashes in `STATUS.md` |

## Failure branch

- Per-authenticator rule binding not supported (P01 Q6): use one account-wide rule shared by all session keys; agent keys then share caps. Document in `architecture/02-account-model.md` and the README.
- Multiple revokes in one transaction rejected: send sequentially in the kill switch, with a progress indicator.
