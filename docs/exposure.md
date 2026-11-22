# Q-Day exposure report

`/exposure/<address>` on the web app, `GET /v1/exposure/:address` on the relayer. It answers one question for any QoreChain address (`qor1…` or `0x…`, including a plain MetaMask address): **how much could someone take who breaks this account's classical keys?** It reads the chain live, never signs anything, and works on Diana testnet only.

The code is `packages/relayer/src/exposure.ts`, with tests in `packages/relayer/test/exposure.test.ts`.

## Facts it relies on

| Fact | How it was checked |
| --- | --- |
| Diana requires hybrid signatures and allows no classical fallback for accounts with a PQC key | `GET /qorechain/pqc/v1/params` returns `hybrid_signature_mode_name: "required"` and `allow_classical_fallback: false` (read live on every report and shown in it; first read 22 Nov 2026) |
| An ML-DSA-87 key is registered by a transaction signed with the account's **classical** key | Spike Q4, "classical bootstrap" registration [`A4A820DD…F839`](https://explore.qore.network/tx/A4A820DDBCAA23E64B67A40E8755C2EBC69CC637CAA4EA61563DB736A5C3F839) |
| A classical public key becomes public when the account first signs | Cosmos `auth` account `pub_key` is set after the first transaction; any EVM transaction reveals the key through its ECDSA signature (`eth_getTransactionCount` > 0) |
| A capped MetaMask key can spend at most the daily limit of the first enabled spending rule, until it expires or is revoked | Spike Q6 (rules bind account-wide), Q7 (over-limit refused), Q8 (revoke is immediate), and the P13 invariants run (`docs/security.md`) |

From these, three cases follow. Breaking a classical key needs its public key (Shor's algorithm), so a key that was never revealed is protected only by the address hash.

## Statuses

| Status | Condition | Worst case ("at risk") | Score |
| --- | --- | --- | --- |
| `protected` | ML-DSA key registered, chain enforces hybrid, no active MetaMask key | 0 | 100 |
| `capped` | ML-DSA key registered, active MetaMask key(s) under an enabled rule | min(balance, daily limit × days until the last key expires); the whole balance if a key never expires | 95 − 40 × (at risk ÷ balance), −10 if a key never expires, between 40 and 95 |
| `capped` | ML-DSA key registered, MetaMask key but no enabled rule | 0 (the chain refuses such keys) | 70 |
| `hidden` | No ML-DSA key, classical key never revealed | whole balance, once the account signs | 35 |
| `claimable` | No ML-DSA key, classical key revealed | whole balance | 5 (20 if the balance is 0) |
| `empty` | No account, no balance, no transactions | 0 | none |

If the chain ever reports classical fallback as allowed, an account with an ML-DSA key is **not** treated as protected: its whole balance counts as at risk and it scores 40.

Grades: A ≥ 90, B ≥ 75, C ≥ 50, D ≥ 25, F below 25.

## What it does not claim

- The score is a heuristic summary of the facts above, not an audit. It does not cover phishing, malicious contracts or a stolen passkey.
- It looks at native QOR (`uqor`) only, not other tokens.
- "Days until expiry" uses the latest expiry among active keys, so it is an upper bound. The kill switch ends the risk at once.
- No date for Q-Day is assumed. QoreChain's own roadmap target for its post-quantum migration is Q3 2027 (see the Migration Meter).
