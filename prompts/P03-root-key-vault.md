# P03 — Root key vault

**Goal:** `@qoreconnect/core` can create, encrypt, unlock, export and restore a post-quantum root key in the browser, with passkey (PRF) protection and a password fallback.

**Depends on:** P02.

**Read first:** `architecture/02-account-model.md`, `architecture/06-security-threat-model.md` (T15–T17), `spike/SDK_NOTES.md` (`derivePqcCanonical`), `spike/RESULTS.md` (Q10 PRF result).

**Time box:** 5 hours.

---

## Prompt

> Implement the root key vault in `packages/core/src/vault/`.
>
> 1. `generateRoot()`: create a 24-word BIP-39 mnemonic using a CSPRNG; derive the QoreChain account (secp256k1, standard QoreChain path) and the ML-DSA-87 keypair with `derivePqcCanonical(address, mnemonic)` from `@qorechain/sdk@0.14.0`. Return `{ qorAddress, evmAddress, pqcPublicKey }` and keep secrets in memory only.
> 2. **Encryption at rest:** AES-256-GCM over the mnemonic. Key source:
>    - **Passkey:** WebAuthn credential with the `prf` extension; derive the AES key with HKDF-SHA-256 from the PRF output and a random salt. Require user verification.
>    - **Fallback:** password with scrypt (N=2^17, r=8, p=1) when PRF is unavailable.
>    Store `{ version, kdf, salt, iv, ciphertext, credentialId, qorAddress }` in IndexedDB. Never store plaintext.
> 3. `unlock()`: passkey assertion (or password) → decrypt → return a `RootSigner` that can produce hybrid signatures via the SDK. The signer zeroes secret buffers after use where possible and auto-locks after 5 minutes.
> 4. `exportRecoveryCode()`: requires a fresh unlock; returns the mnemonic for one-time display. `restoreFromRecoveryCode(words)`: validates the checksum, re-derives, re-encrypts with a new passkey.
> 5. `RootSigner.signAndBroadcast(msgs, fee)` wraps the SDK's hybrid signing (secp256k1 + ML-DSA-87). `RootSigner.signMessage(bytes)` produces an ML-DSA-87 message signature (QoreSign message signing or `@qorechain/pqc`), used later for agent instructions.
> 6. Unit tests (Vitest, jsdom or happy-dom + fake-indexeddb): derivation is deterministic (same mnemonic → same addresses and ML-DSA pubkey as the P01 spike); password encryption round-trips; wrong password fails; ciphertext tampering fails (GCM tag); storage never contains the mnemonic in plaintext (search the stored blob).
> 7. A minimal dev page in `apps/web` (`/dev/vault`) to create a vault with a passkey, unlock it, and show the addresses, for manual testing.

---

## Deliverables

- `packages/core/src/vault/*` with exported API
- Unit tests
- `/dev/vault` page

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | `pnpm --filter @qoreconnect/core test` | All vault tests pass |
| G2 | Determinism | Addresses and ML-DSA pubkey match the P01 spike for the same mnemonic (test vector) |
| G3 | No plaintext at rest | Test asserts the IndexedDB record does not contain any mnemonic word sequence |
| G4 | Manual passkey | On Chrome (Windows Hello): create → reload → unlock with passkey → same address |
| G5 | Manual fallback | With PRF disabled (forced flag), password path works |
| G6 | Typecheck and lint | Clean |

## Failure branch

- PRF unavailable on the target browser: make the password path the default for that browser, keep passkey as an enhancement, and note it in the README's limitations.
- `derivePqcCanonical` does not run in the browser (Node-only dependency): run derivation in a Web Worker with polyfills; if still impossible, record it and escalate. The root key must never be derived on a server.
