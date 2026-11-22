# Security

QoreConnect is testnet software for QoreChain **Diana**. It is **not audited**. Use small amounts.

This page maps every threat in [`architecture/06-security-threat-model.md`](../architecture/06-security-threat-model.md) to the code that
mitigates it and the test that proves it (P13, gate G3). File references are `path:line` at the P13 commit.

**How to run the tests**

| Suite | Command | Where it runs |
|---|---|---|
| Unit (mocked chain) | `pnpm test` | CI, every push |
| Contracts | `pnpm test:contracts` | CI, every push |
| Secret scan | gitleaks | CI, every push |
| Client bundle scan | `node scripts/scan-bundles.mjs` (after `pnpm build`) | Local, before release |
| Integration (Diana testnet) | `pnpm test:integration` (needs the operator keys in `.env`) | Local |
| Browser E2E | `cd apps/web && PW_CHANNEL=msedge pnpm test:e2e` | Local |

## Threats → mitigations → tests

| # | Threat | Mitigation (code) | Test |
|---|---|---|---|
| T1 | Quantum attacker breaks the MetaMask key | MetaMask is only a session key, bounded by per-tx, daily and allow-list rules: `packages/core/src/account/rules.ts:58` (`mergeForLink`). Q-Day kill switch revokes every classical key in one transaction: `packages/core/src/account/session.ts:181` (`revokeKeys('all-classical')`), wired in `apps/web/app/account/page.tsx:360`. | `packages/relayer/test/integration/session.test.ts` (revoke all, 2 keys, 1 tx on Diana); `apps/web/e2e/onboard-dashboard.spec.ts` (kill switch leaves no keys) |
| T2 | Quantum attacker breaks the root's secp256k1 half | Root transactions are hybrid (secp256k1 + ML-DSA-87); the ML-DSA-87 key is registered with a possession proof: `packages/core/src/onboard.ts:125`. Enforced by the chain. | `packages/relayer/test/integration/onboard.test.ts` (`possessionProven=true` on Diana) |
| T3 | Phishing dApp asks for a harmful call | Readable preview with simulation and chain-refusal prediction before MetaMask: `packages/core/src/preview/preview.ts:193`; allow-list and caps enforced again by the relayer (`packages/relayer/src/relay.ts:156`, `:164`) and by the chain. | `packages/core/test/preview.test.ts` (policy prediction, revert reason); `packages/react/test/preview.test.tsx` (Blocked calls offer no signing button) |
| T4 | Phishing dApp asks to approve a drainer contract | Approval sheet shows the site origin, every address with explorer links, unchanged limits, and checks each address for contract code, warning when there is none; it states that contract code is not verified: `packages/react/src/approve/ApproveSheet.tsx:22`. Caps are unchanged by approval. | `packages/react/test/onboarding.test.tsx` (ApproveSheet; T4 no-code warning); `pnpm demo:attack` (Drainer refused, code 10) |
| T5 | Blind signing in MetaMask (raw digest) | The previewed call is frozen and the digest is built from that same object: `packages/core/src/preview/preview.ts:194`, `:323`; `packages/core/src/relay.ts:80`. | `packages/core/test/preview.test.ts` (digest binding: every field changes the digest; `signRelayRequest` signs the previewed call) |
| T6 | Relayer alters the transaction | The relayer recovers the signer from the digest before broadcasting (`packages/relayer/src/relay.ts:129`); the chain verifies the session key's signature over the digest, gas limit included. | `packages/relayer/test/relay.test.ts` (tampered request refused) |
| T7 | Relayer replays a transaction | Per-authenticator nonce: the relayer refuses a stale nonce before broadcast (`packages/relayer/src/relay.ts:141`); the chain refuses with code 11. | `packages/relayer/test/relay.test.ts` (NONCE); `packages/relayer/test/integration/invariants.test.ts` (I3 on Diana) |
| T8 | Relayer censors | Any relayer URL works (`packages/core/src/provider/provider.ts:59`); the relayer is self-hostable (`apps/relayer`, Dockerfile built in CI); the root key can always act directly. | CI `relayer-docker` job (image builds and serves `/health`) |
| T9 | Relayer lies about the result | The SDK fetches the transaction by hash, checks that it contains **this** call (account, target, data, value, nonce, gas limit) and that the chain's execution result is `success=true`: `packages/core/src/provider/provider.ts:382`. | `packages/core/test/provider.test.ts` (invariant 4 / T9); `packages/relayer/test/integration/invariants.test.ts` (I4 on Diana, success and refusal) |
| T10 | Prompt injection commands the agent | The agent acts only on root-signed ML-DSA-87 instructions verified against the key registered on chain (`packages/core/src/agent.ts:120`) and a local guard limits calls to the instruction's targets and selectors (`packages/core/src/agent.ts:339`). Agents live on their own sub-account with their own caps. | `packages/core/test/agent.test.ts` (tampered, wrong key, unsigned, expired, wrong agent/chain); `examples/agent` tests (injection a/b); P11 Diana run (chain code 10) |
| T11 | Rule replacement wipes existing rules | Read-merge-write on every update (`packages/core/src/account/rules.ts:58`–`:91`) and the invariant checker after every write (`packages/core/src/account/session.ts:89`). | `packages/core/test/rules.test.ts`; `packages/core/test/invariants.test.ts` (random sequences, I2) |
| T12 | "No enabled rule = no limit" | Invariant 1, checked after every write and by the Doctor: `packages/core/src/account/rules.ts:123`; `packages/relayer/src/doctor.ts`. The allow-list is never empty (sentinel): `packages/core/src/account/rules.ts:46`. | `packages/core/test/rules.test.ts` (`assertRuleInvariants`); `packages/relayer/test/doctor.test.ts`; I1 on Diana |
| T13 | Bare value transfer bypasses `allowed_evm_calls` | Caps are always set on the managed rule (`mergeForLink` defaults), so a bare transfer is still bounded per transaction and per day. | `packages/relayer/test/integration/relay.test.ts` (per-tx and daily refusals on Diana) |
| T14 | Sponsor farming | One sponsorship per MetaMask address and per account, a possession proof, per-IP and global daily limits, tiny amounts: `packages/relayer/src/sponsor.ts:78`–`:92`. | `packages/relayer/test/sponsor.test.ts` (second sponsorship 409, per-IP, global budget, wrong root) |
| T15 | Device thief with unlocked browser | Seed encrypted at rest (AES-GCM, addresses bound as AAD); root operations need a fresh passkey assertion with user verification: `packages/core/src/vault/passkey.ts:51`, `:70`; `packages/core/src/vault/vault.ts:116`. | `packages/core/test/vault.test.ts`; `packages/core/test/indexeddb.test.ts` (no mnemonic words stored) |
| T16 | Lost device | Recovery code export and restore on a new device: `packages/core/src/vault/vault.ts:101`, `:106`; progressive backup nudge on the dashboard: `apps/web/app/account/page.tsx:179`. | `packages/core/test/vault.test.ts` (restore on a new device) |
| T17 | XSS in the web app reads the decrypted seed | Strict CSP with a per-request script nonce on vault pages (`apps/web/proxy.ts:10`, `apps/web/lib/csp.ts:30`), no third-party scripts anywhere, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `Referrer-Policy`, `nosniff`; plaintext zeroed after use (`packages/core/src/vault/vault.ts:88`). | `apps/web/e2e/security.spec.ts` (headers on every page, injected script does not run, nonce changes per request, third-party script blocked) |
| T18 | Supply-chain attack | Lockfile with exact pins for critical packages (`pnpm-workspace.yaml` overrides), `--frozen-lockfile` in CI, pnpm's minimum release age, only official `@qorechain/*` kits for crypto. | `pnpm audit` (see below) |
| T19 | Secrets leak from the repo or the bundles | `.env` ignored (`.gitignore:14`); gitleaks in CI (`.github/workflows/ci.yml`); separate sponsor and relayer accounts; the bundle scan looks for every secret env name and local secret value in client output: `scripts/scan-bundles.mjs`. | CI `secrets` job; `node scripts/scan-bundles.mjs` (G6) |

## Invariants

| # | Invariant | Mocked (CI) | Diana (integration) |
|---|---|---|---|
| I1 | Every linked value-moving key has an enabled, finite rule for every denom | `packages/core/test/invariants.test.ts`, `rules.test.ts` | `invariants.test.ts`, `session.test.ts` |
| I2 | Rule updates keep every other rule | `packages/core/test/invariants.test.ts` | `invariants.test.ts`, `session.test.ts` |
| I3 | The relayer never broadcasts a stale nonce | `packages/relayer/test/relay.test.ts` | `invariants.test.ts`, `relay.test.ts` |
| I4 | Success only when the chain says `success=true` for this call | `packages/core/test/provider.test.ts` | `invariants.test.ts` |
| I5 | No private key or seed is sent over the network | `packages/core/test/invariants.test.ts` | `invariants.test.ts` (every URL, body and broadcast transaction scanned) |

## Relayer hardening

| Control | Code | Test |
|---|---|---|
| Request body limit (413 before parsing) | `packages/relayer/src/app.ts:47` | `packages/relayer/test/hardening.test.ts` |
| Chain REST timeouts | `packages/core/src/chain/http.ts:3` | `hardening.test.ts` (hung call times out) |
| Rate limits per account, per IP, per Doctor caller | `packages/relayer/src/relay.ts:115` | `relay.test.ts`, `hardening.test.ts` |
| `/health` alerts on low relayer or sponsor balance, never secrets | `packages/relayer/src/app.ts:26` | `hardening.test.ts` |
| Mandatory pre-check before broadcast (signature, nonce, key state, allow-list incl. selectors, caps, revert) | `packages/relayer/src/relay.ts:129`–`:181` | `relay.test.ts` |
| Admin routes need `ADMIN_TOKEN` | `apps/relayer/src/server.ts:83` | `relay.test.ts` (401 without token) |

## Dependency audit (`pnpm audit --prod`, 22 Nov 2026)

All findings are transitive and reach only the **demo dApp's browser bundle**, through wagmi's WalletConnect connector
and viem's optional `abitype` → `zod@3` peer. None reaches the relayer or the web app's vault code.

| Package | Severity | Path | Action |
|---|---|---|---|
| `decode-uri-component` ≤0.5.0 | high, moderate | demo dApp → wagmi connectors → WalletConnect → query-string | Overridden to 0.5.1 |
| `uuid` <11.1.1 | moderate | demo dApp → wagmi connectors → @metamask/utils | Overridden to 11.1.1 |
| `zod` <4.6.6 | high | demo dApp → viem → abitype (optional `abitype/zod` entry, never imported) | Accepted: not loaded at runtime. The relayer, which validates untrusted input, uses zod 4.6.7. |

## Known limitations

- The MetaMask key is classical. It is capped, scoped and revocable, not quantum-safe.
- MetaMask shows a raw digest; users rely on QoreConnect's preview (T5).
- QoreConnect does not verify what a contract's code does; the approval sheet says so, and caps bound the loss (T4).
- Abstract accounts are switched off on mainnet; QoreConnect runs on Diana testnet only.
- The relayer is a liveness dependency (self-hostable; the root key can always act directly) (T8).
- Passkey PRF is not available in every browser; the fallback is password-based encryption.
- A same-origin compromise of the web app defeats the CSP (T17).
- Not audited.

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository rather than a public issue.
