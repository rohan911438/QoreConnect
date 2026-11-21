# P04 — Chain client and sponsored onboarding

**Goal:** A new root account can be created, sponsored and registered with its ML-DSA-87 key on Diana testnet, from the browser, in one call.

**Depends on:** P03.

**Read first:** `architecture/03-flows.md` (Flow A), `architecture/04-relayer.md` (sponsor), `spike/RESULTS.md` (Q4, Q5 fees).

**Time box:** 1 day.

---

## Prompt

> 1. **Chain client** in `packages/core/src/chain/`: typed wrappers over REST for account state: `getPqcKey(address)` (also via the `pqcKeyStatus` precompile with `possessionProven`), `getAuthenticators`, `getSpendingRules`, `getAuthNonce`, `getEvmWindows`, `getBalance`. All REST calls go through a configurable base URL so the web app can use its `/api/qore/*` proxy (public REST has no CORS). Return typed objects; handle 404s as "not found", not errors.
> 2. **REST proxy** in `apps/web/app/api/qore/[...path]/route.ts`: forwards GET requests to `https://api-testnet.qore.host` with an allow-list of path prefixes; adds caching headers for read-only endpoints.
> 3. **Sponsor endpoint** in `packages/relayer` + `apps/relayer`: `POST /v1/sponsor` per `architecture/04-relayer.md`. It verifies the MetaMask possession signature over the root address, enforces one sponsorship per MetaMask address and per-IP limits (SQLite via Drizzle), and sends the amount measured in P01 (plus 20%) from the sponsor account. Returns the tx hash.
> 4. **`onboardRoot()`** in `packages/core`: given an unlocked `RootSigner` and the MetaMask provider: (a) request sponsorship; (b) wait for funds; (c) register the ML-DSA-87 key (the first, classical-signed transaction, as established in P01); (d) wait for `possessionProven = true`. Emit progress events (`sponsoring`, `registering`, `registered`) for the UI. Idempotent: if the key is already registered, skip.
> 5. **Integration test** (`packages/core/test/integration/onboard.test.ts`, run with `pnpm test:integration`, needs `.env`): fresh root → sponsored → registered, against Diana. Prints tx hashes. Skipped in CI unless secrets are present.

---

## Deliverables

- `packages/core/src/chain/*`
- `apps/web` REST proxy route
- `POST /v1/sponsor` in the relayer
- `onboardRoot()` with progress events
- Integration test

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | Unit tests | Pass |
| G2 | Integration test on Diana | Fresh account sponsored and ML-DSA key registered; `possessionProven = true`; tx hashes in `STATUS.md` |
| G3 | Sponsor abuse controls | Second sponsorship for the same MetaMask address is refused (test) |
| G4 | Proxy | `GET /api/qore/qorechain/pqc/...` works from the browser; disallowed paths return 403 |
| G5 | Timing | Sponsor + registration completes in under 30 seconds (record the time) |

## Failure branch

- Registration fails because the account was funded but the first-transaction rule differs from P01 findings: re-run the P01 Q4 script, compare, fix.
- Timing over 30 seconds: parallelise what can be parallelised (sponsorship request at passkey-creation time), and show honest progress in the UI. Not a blocker.
