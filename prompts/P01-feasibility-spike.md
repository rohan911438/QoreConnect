# P01 — Feasibility spike on Diana testnet (GO / NO-GO)

**Goal:** Prove or disprove, on the live Diana testnet, every assumption the design depends on (Q1–Q12 in `architecture/08-open-questions-and-verification.md`), with transaction hashes as evidence. No product code.

**Depends on:** nothing. **Requires from the user:** a funded operator account on Diana (QoreX on Testnet + faucet claim), or permission to generate a fresh operator mnemonic and have the user claim the faucet for it.

**Read first:**
- `architecture/02-account-model.md`
- `architecture/03-flows.md`
- `architecture/08-open-questions-and-verification.md`

**Time box:** 1 day.

---

## Prompt

> You are running the P01 feasibility spike for QoreConnect. Work only in `spike/`. Do not create product packages.
>
> 1. **Setup.** Create `spike/` as a standalone Node 22 TypeScript project (pnpm, `tsx`). Install exactly: `@qorechain/sdk@0.14.0`, `@qorechain/pqc@0.2.3`, `@qorechain/qoresign@0.2.0`, `@qorechain/evm@0.14.0`, `@qorechain/wallet-adapter@0.6.0`, `viem`, `dotenv`. Create `spike/.env.example` with `OPERATOR_MNEMONIC=`, REST/RPC/EVM endpoints and chain ids. Make sure `.env` is git-ignored. Ask the user to fill `spike/.env`; never print the mnemonic.
> 2. **Read the SDK source** in `node_modules/@qorechain/sdk` and `@qorechain/wallet-adapter` for: `linkAuthenticatorMsgs`, `registerEthAuthenticatorMsg`, `buildMetaMaskExecuteEvm`, `metaMaskPossessionProof`, `fetchAuthNonce`, `fetchSpendingRules`, `fetchAuthenticators`, `revokeAuthenticatorMsg`, `assertAuthenticatorExecutionsSucceeded`, `openEvmWindowMsg`, `derivePqcCanonical`. Write `spike/SDK_NOTES.md` with each function's real signature and, specifically, **whether `buildMetaMaskExecuteEvm` or the underlying `MsgExecuteEVM` accepts calldata**. If it does not, find the lower-level builder that does.
> 3. **Write one script per question** in `spike/src/` (`q01-calldata.ts`, `q02-window.ts`, …), each printing a clear PASS / FAIL and all transaction hashes. Use a **local secp256k1 key (viem `privateKeyToAccount`) that signs EIP-191 exactly like MetaMask's `personal_sign`** to stand in for MetaMask. For each question:
>    - **Q4 / Q5 (do first):** generate a fresh root mnemonic; fund it from the operator with a small amount; register its ML-DSA-87 key; record fees and gas.
>    - **Q1 / Q3 / Q12:** deploy a minimal `Counter` contract that stores `msg.sender` and increments (operator deploys, using its own key + window). Link the stand-in MetaMask address to the fresh root with permissions `["evm"]` only, 1-day expiry, possession proof, and a spending rule (`perTxLimit`, `dailyLimit`, `allowedDenoms: ["uqor"]`, `allowed_evm_calls: [counter]`). Build a `MsgExecuteEVM` with calldata `increment()`, signed by the stand-in key with digest v2; broadcast it from a separate relayer account (operator can act as relayer). Check: counter incremented, stored `msg.sender` value, the execution event `success` flag.
>    - **Q2:** repeat Q1 with no EVM window open on the root, then with one open. Record which works.
>    - **Q6:** query the rule and authenticator REST endpoints; save raw JSON to `spike/results/`.
>    - **Q7:** call a second contract not in the allow-list (expect code 10); send value above `perTxLimit` (expect code 5); confirm that code 0 + `success=false` is detected by `assertAuthenticatorExecutionsSucceeded`.
>    - **Q8:** link a second key; revoke both in one transaction; confirm the next execution fails.
>    - **Q11:** sign a message with the root's ML-DSA-87 key (QoreSign message signing or `@qorechain/pqc` `mldsa.sign`), fetch the root's registered pubkey (`pqcKeyStatus` via EVM `eth_call` to `0x0000000000000000000000000000000000000a02`, or REST), verify.
> 4. **Q10:** create `spike/prf-test.html`, a static page that calls `navigator.credentials.create` with the `prf` extension and reports whether PRF output is available. The user opens it in Chrome on this Windows machine and reports the result.
> 5. **Q9:** write manual steps in `spike/RESULTS.md` for the user to import the spike root mnemonic into QoreX (testnet) and check that the `qor1` address matches. Ask the user to do it and report back.
> 6. **Q13:** remind the user to post the organiser question from `tracks/02-main-track-pq-ai-agents.md` in the fest Discord.
> 7. **Write `spike/RESULTS.md`:** one row per question with PASS / FAIL / PARTIAL, evidence (tx hashes with explorer links `https://explore.qore.network/...`), measured fees, and what changes in the design. Update the Status column in `architecture/08-open-questions-and-verification.md`. Update any architecture file whose assumption turned out wrong.
> 8. **Make the go / no-go call** using the rules below, and write it at the top of `spike/RESULTS.md`.

---

## Deliverables

- `spike/` project with one script per question
- `spike/SDK_NOTES.md` (real function signatures)
- `spike/RESULTS.md` (results table, evidence, go/no-go decision)
- `spike/results/*.json` (raw REST responses)
- `spike/prf-test.html`
- Updated `architecture/08-open-questions-and-verification.md`
- `prompts/STATUS.md` updated (P01 row, accounts table, Counter address)

## Validation gate

| # | Check | Pass condition |
|---|---|---|
| G1 | Q1 calldata execution | Counter incremented through a session-key `MsgExecuteEVM`; tx hash recorded |
| G2 | Q4 sponsored new account | A fresh account funded by another account registers its ML-DSA key and links a key; fees recorded |
| G3 | Q7 negative cases | Not-allowed contract refused; over-limit refused; refusal detected by the SDK helper |
| G4 | Q8 revoke | Execution after revoke fails |
| G5 | Evidence | Every PASS has at least one explorer-verifiable tx hash in `RESULTS.md` |
| G6 | No secrets | `git status` shows no `.env`; a search for the word "mnemonic" in tracked files finds only `.env.example` and docs |

**GO** = G1, G2, G3, G4, G5 and G6 pass. Q2, Q3, Q6, Q9–Q12 may be PASS or adjusted-design; record the adjustment.

## Failure branch

| Failure | Action |
|---|---|
| **G1 fails** (no calldata through authenticators) | **NO-GO.** Stop. Record findings. Options to present to the user: (a) native-lane-only product using `buildMetaMaskExecuteCosmos` (send, swap, stake) for MetaMask users; (b) switch to the Post-Quantum dApp category with a `pqcVerify`-guarded smart-account contract on the EVM, where MetaMask signs EIP-712 and a contract verifies; (c) ask in Discord whether calldata support is planned. Do not continue to P02 without the user's decision. |
| G2 fails (sponsorship impossible) | Continue with adjusted design: the user claims the faucet once during onboarding (link from the UI). Update `architecture/03-flows.md` Flow A. |
| G3 fails (limits not enforced as documented) | **Stop and report.** The security story depends on it. Re-test with the exact JSON from `SDK_NOTES.md`; ask in Discord. |
| G4 fails (revoke not immediate) | Continue; document the delay; kill switch also closes windows and sets rules to zero caps. |
| Time box exceeded | Report partial results; G1 has priority over everything else. |
