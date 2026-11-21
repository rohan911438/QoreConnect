# Build status

Update this file after every validation gate. One row per attempt.

| Prompt | Date | Result | Evidence | Deviations / notes |
|---|---|---|---|---|
| P01 | 2026-11-21 | **PASS (GO)** | Q1–Q8, Q11, Q12 pass on Diana; tx hashes in spike/RESULTS.md | Rules are account-wide, so agents use sub-accounts; relayer must pre-check (refusals cost fees); envelope gas ≥ signed gas + 450k; no EVM window needed. Q10 (PRF) and Q13 (category) pending manual. |
| P02 | 2026-11-21 | **PASS** | install/build/lint/typecheck/tests green; forge test 2/2; relayer /health live on Diana (height 10492184); web / and /dev/vault 200 | pnpm 11 release-age policy: pinned viem 2.58.2, react-query 5.108.0; wagmi 2.19.5 + TS 5.9.3 kept for RainbowKit/QoreX compatibility; Foundry 1.5.1 via release zip on Windows. G7/G8 verified in CI after push. |
| P03 | 2026-11-21 | **PASS (auto gates)** | 12 core tests: password + passkey(fake PRF) round-trip, wrong password, AAD tamper, IndexedDB blob has no mnemonic word pair, test vector qor17fuv7k…l9s7p / 0xF278…1cdb matches SDK | G4 (Windows Hello passkey) and G5 (forced password) are manual on /dev/vault. Vault binds addresses into AES-GCM AAD. |
| P04 | 2026-11-21 | **PASS** | Diana: sponsor tx 97FB1D68…A48C, register tx ED216C8D…D6F4, possessionProven=true, **10.9 s** end to end (G5 < 30 s); G3 second sponsorship refused (unit + live); proxy: pqc lookup 200, gov 403, POST non-tx 403 | Integration test lives in packages/relayer (needs core + relayer, avoids a dependency cycle). Simulation uses a zero fee (new accounts cannot afford a 3M-gas placeholder fee). SQLite via node:sqlite instead of Drizzle (no native build). Sponsor amount 0.24 QOR; registration left 0.181 QOR. Proxy also forwards POST simulate/broadcast of signed bytes. |
| P05 | | not started | | |
| P06 | | not started | | |
| P07 | | not started | | |
| P08 | | not started | | |
| P09 | | not started | | |
| P10 | | not started | | |
| P11 | | not started | | |
| P12 | | not started | | |
| P13 | | not started | | |
| P14 | | not started | | |
| P15 | | not started | | |
| P16 | | not started | | |

## Testnet accounts in use

| Role | qor1 address | 0x address | Funded on |
|---|---|---|---|
| Operator / sponsor / relayer | qor1wpae9a38v7vlj2xvun2cw0669w4ls568zar4w8 | 0x707B92f6276799f928CCe4D5873f5A2babF85347 | ~99.8 QOR on 21 Nov |
| Sponsor (operator index 0) | qor1wpae9a38v7vlj2xvun2cw0669w4ls568zar4w8 | 0x707B92f6276799f928CCe4D5873f5A2babF85347 | 96.18 QOR on 21 Nov |
| Relayer (operator index 1) | qor1zl9mfjhqksshzjpf7erp9nypadncfz3n42hct8 | — | not funded yet (P06) |
| Spike user root | qor10z0spuhkwp0dzr0sx4rhl3ed83z8pe8yk9848s | 0x789F00F2F6705ed10DF035477fc72d3C4470E4E4 | sponsored 3 QOR, 21 Nov |
| Spike stand-in MetaMask | — | 0x974944048DeC3f8Ff1bA6bB076724D86c085d69B | — |
| P04 integration root | qor1pzm4s3ev6tkklv332a84cqsyr37qvwzya4vpsu | 0x08b758472cD2Ed6fb231574F5c02041C7C063844 | sponsored 0.24 QOR, 21 Nov |
| Agent | | | |

(Addresses only. Never write mnemonics or private keys here.)

## Deployed contracts

| Contract | Address | Tx hash |
|---|---|---|
| SpikeCounter (allowed) | 0xfa1643e3fbd2f58d8dbaf4ec025c2541062ffc74 | 0xe3e232b7adeff08abb48f6dc0930f76c1da3519bd9dc26dcf243c174176a892d |
| SpikeCounter (other) | 0x5017fbbc1de44e698d1778630bce63741c1d0005 | 0xe73dba8561208d09250160eb027885e9feb91bcea96339303026951e7dd6c85e |
